import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, QueryFailedError } from "typeorm";

import { CardCannotBeRecharged, PaymentNotFound, QpayproStartFailed, QpayproUnavailable } from "../citizen.errors.js";
import { CitizenService, type Queryable } from "../citizen.service.js";
import {
  QPAYPRO_REFERENCE_PREFIX,
  type CreatePaymentDto,
  type PaymentStartedDto,
  type PaymentStatusDto,
} from "../dto/citizen.dto.js";
import {
  QPAYPRO_CLIENT,
  QpayproClientError,
  type QpayproClient,
  type QpayproTransactionDetail,
} from "./qpaypro.client.js";
import { readCheckoutConfig, readQpayproEnv, redactSecrets, type QpayproCheckoutConfig } from "./qpaypro.config.js";
import { fpSequenceFor } from "./qpaypro.fp-sequence.js";
import { verifyOrderHash } from "./qpaypro.signature.js";

const CARD_ACTIVE = "ACTIVA";
const PAYMENT_STARTED = "INICIADA";
const PAYMENT_ERROR = "ERROR";
const PAYMENT_APPROVED = "APROBADA";
const PAYMENT_REJECTED = "RECHAZADA";
const PAYMENT_EXPIRED = "EXPIRADA";
// S4: a relay can settle only these; a signed approval after expiry still
// credits, because the bank charged.
const SETTLEABLE = [PAYMENT_STARTED, PAYMENT_EXPIRED];
const RELAY_APPROVED = "1";
// S7: get_transaction_detail status of an approved payment (L7).
const DETAIL_APPROVED = "Aprobada";
// Postgres' default name for UNIQUE (id_transaccion_qpaypro) in database/init.sql.
const QPAYPRO_ID_UNIQUE = "tbl_transaccion_pago_id_transaccion_qpaypro_key";
const RECEIPT_PREFIX = "QPP-REC-";
// S6 (user: "10 mins aprox").
export const PAYMENT_EXPIRY_MINUTES = 10;
// S7, L10: a QPayPro transaction older than our payment minus this clock
// skew belongs to someone else on the shared sandbox login.
export const QUERY_SKEW_MINUTES = 5;
// QPayPro's dateTransaction, e.g. "2021-07-28T20:13:06.000000Z".
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const UNKNOWN_PAYMENT = "desconocido";

export type RelayQuery = Record<string, unknown>;

// S7 outcome of asking QPayPro about a payment (T4).
export type ReconcileOutcome = "approved" | "rejected" | "unknown";

interface PaymentLockRow {
  id: string;
  idTarjeta: string;
  monto: string;
  estado: string;
}

// What QPayPro confirmed about a payment (S4 relay or S7 query).
interface Settlement {
  approved: boolean;
  idQpaypro: string;
  codigoRespuesta: string | null;
  numeroAutorizacion: string | null;
}

// The payment as S7 needs it to ask QPayPro.
export interface ReconcilablePayment {
  id: string;
  referencia: string;
  idQpaypro: string | null;
  fechaTransaccion: Date | string;
}

interface PaymentStatusRow {
  id: string;
  referencia: string;
  idQpaypro: string | null;
  numeroTarjeta: string;
  monto: string;
  estadoPago: string;
  numeroComprobante: string | null;
  saldo: string;
  fechaTransaccion: Date | string;
  vencida: boolean;
}

// A query parameter as a non-empty string; repeated or missing -> undefined.
const param = (query: RelayQuery, name: string): string | undefined => {
  const value = query[name];
  return typeof value === "string" && value !== "" ? value : undefined;
};

const isQpayproReference = (referencia: string | undefined): referencia is string =>
  referencia !== undefined && referencia.startsWith(QPAYPRO_REFERENCE_PREFIX);

// S4: x_amount equals monto_pago to the cent.
const sameAmount = (amount: string, monto: string) =>
  /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount).toFixed(2) === Number(monto).toFixed(2);

// QPayPro hosted checkout of card recharges (odd/tasks/qpaypro-checkout.md).
// The browser pays on QPayPro's page and comes back through the relay; the
// email is sent to QPayPro only and never stored.
@Injectable()
export class QpayproPaymentsService {
  private readonly logger = new Logger(QpayproPaymentsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly citizenService: CitizenService,
    @Inject(QPAYPRO_CLIENT)
    private readonly client: QpayproClient,
  ) {}

  // S2, S3. The row is committed before the call to QPayPro, so no lock is
  // held during the network round trip.
  async start(numeroTarjeta: string, dto: CreatePaymentDto): Promise<PaymentStartedDto> {
    const config = readCheckoutConfig();
    if (!config) throw new QpayproUnavailable();

    const monto = dto.monto.toFixed(2);
    const referencia = `${QPAYPRO_REFERENCE_PREFIX}${randomUUID()}`;
    const idTransaccion = await this.dataSource.transaction(async (manager) => {
      const card = await this.citizenService.findCard(manager, numeroTarjeta, true);
      if (card.estado !== CARD_ACTIVE) throw new CardCannotBeRecharged(card.estado);
      const rows = (await manager.query(
        `INSERT INTO tbl_transaccion_pago (id_tarjeta_ciudadana, referencia_pago, monto_pago, moneda, estado_pago)
         VALUES ($1, $2, $3, 'GTQ', $4)
         RETURNING id_transaccion_pago AS "id"`,
        [card.idTarjeta, referencia, monto, PAYMENT_STARTED],
      )) as { id: string }[];
      return String(rows[0]!.id);
    });

    let token: string;
    try {
      ({ token } = await this.client.registerTransaction(
        this.registerFields(config, referencia, monto, dto.email),
      ));
    } catch (error) {
      const message =
        error instanceof QpayproClientError
          ? error.message
          : redactSecrets(error instanceof Error ? error.message : String(error));
      await this.dataSource.query(
        `UPDATE tbl_transaccion_pago SET estado_pago = $2, mensaje_respuesta = $3
          WHERE id_transaccion_pago = $1 AND estado_pago = $4`,
        [idTransaccion, PAYMENT_ERROR, message, PAYMENT_STARTED],
      );
      this.logger.warn(`QPayPro registration failed for ${referencia}: ${message}`);
      throw new QpayproStartFailed();
    }

    return { referencia, checkoutUrl: `${config.baseUrl}/checkout/woocommerce?token=${encodeURIComponent(token)}` };
  }

  // S4: the payer's browser comes back here from QPayPro. Returns where to
  // redirect; never fails, so the payer always lands on user-web.
  async relay(query: RelayQuery): Promise<string> {
    const env = readQpayproEnv();
    if (!env.userWebUrl) throw new QpayproUnavailable();
    const orderId = param(query, "order_id");
    let pago = UNKNOWN_PAYMENT;
    if (isQpayproReference(orderId)) {
      try {
        if (await this.applyRelay(orderId, query, env.privateKey)) pago = orderId;
      } catch (error) {
        pago = orderId;
        this.logger.error(`QPayPro relay failed for ${orderId}: ${redactSecrets(String((error as Error)?.message ?? error))}`);
      }
    }
    return landingUrl(env.userWebUrl, pago);
  }

  // Returns whether order_id is a QPayPro transaction. Any rejected relay
  // (unsigned, forged, wrong amount, already settled) changes nothing.
  private applyRelay(referencia: string, query: RelayQuery, privateKey: string | undefined): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      // The row lock makes concurrent relays of one payment credit once.
      const tx = await this.lockPayment(manager, referencia);
      if (!tx) return false;

      const transId = param(query, "x_trans_id");
      const amount = param(query, "x_amount");
      const status = param(query, "x_response_status");
      const hash = param(query, "order_hash");
      if (!privateKey || !transId || !amount || !status || !hash) {
        this.logger.warn(`QPayPro relay for ${referencia} ignored: missing parameters or private key`);
        return true;
      }
      if (!verifyOrderHash({ orderId: referencia, transId, amount, status, hash }, privateKey)) {
        this.logger.warn(`QPayPro relay for ${referencia} ignored: bad order_hash`);
        return true;
      }
      if (!sameAmount(amount, tx.monto)) {
        this.logger.warn(`QPayPro relay for ${referencia} ignored: x_amount does not match monto_pago`);
        return true;
      }
      if (!SETTLEABLE.includes(tx.estado)) return true;

      await this.settle(manager, tx, {
        approved: status === RELAY_APPROVED,
        idQpaypro: transId,
        codigoRespuesta: status,
        numeroAutorizacion: null,
      });
      return true;
    });
  }

  // S4, S7: inside the caller's transaction, with the payment row locked and
  // SETTLEABLE. Approved -> APROBADA plus the recharge; else RECHAZADA.
  private async settle(manager: Queryable, tx: PaymentLockRow, settlement: Settlement): Promise<void> {
    await manager.query(
      `UPDATE tbl_transaccion_pago
          SET estado_pago = $2, id_transaccion_qpaypro = $3, codigo_respuesta = $4,
              numero_autorizacion = COALESCE($5, numero_autorizacion), fecha_confirmacion = CURRENT_TIMESTAMP
        WHERE id_transaccion_pago = $1`,
      [
        tx.id,
        settlement.approved ? PAYMENT_APPROVED : PAYMENT_REJECTED,
        settlement.idQpaypro,
        settlement.codigoRespuesta,
        settlement.numeroAutorizacion,
      ],
    );
    if (settlement.approved) {
      await this.citizenService.creditRecharge(manager, tx.id, tx.idTarjeta, Number(tx.monto).toFixed(2), RECEIPT_PREFIX);
    }
  }

  // S5: the payer left QPayPro's page without paying.
  async cancel(referencia: unknown): Promise<string> {
    const env = readQpayproEnv();
    if (!env.userWebUrl) throw new QpayproUnavailable();
    if (typeof referencia !== "string" || !isQpayproReference(referencia)) {
      return landingUrl(env.userWebUrl, UNKNOWN_PAYMENT);
    }
    const found = await this.dataSource.transaction(async (manager) => {
      const tx = await this.lockPayment(manager, referencia);
      if (tx?.estado === PAYMENT_STARTED) {
        await manager.query(`UPDATE tbl_transaccion_pago SET estado_pago = $2 WHERE id_transaccion_pago = $1`, [
          tx.id,
          PAYMENT_EXPIRED,
        ]);
      }
      return tx !== undefined;
    });
    return landingUrl(env.userWebUrl, found ? referencia : UNKNOWN_PAYMENT);
  }

  // S6. A stale INICIADA payment is first reconciled with QPayPro (S7) and,
  // if that cannot settle it, expired. No cron: this is lazy (L2).
  async status(referencia: string): Promise<PaymentStatusDto> {
    let row = await this.findStatus(referencia);
    if (row.estadoPago === PAYMENT_STARTED && row.vencida) {
      const outcome = await this.reconcile(row);
      if (outcome === "unknown") {
        // Conditional: a relay may have settled it meanwhile.
        await this.dataSource.query(
          `UPDATE tbl_transaccion_pago SET estado_pago = $2
            WHERE id_transaccion_pago = $1 AND estado_pago = $3`,
          [row.id, PAYMENT_EXPIRED, PAYMENT_STARTED],
        );
      }
      row = await this.findStatus(referencia);
    }
    return toStatusDto(row);
  }

  // S7 staff verify: reconciles an INICIADA or EXPIRADA payment of this card
  // at any age, without expiring it, then answers the S6 body.
  async verify(numeroTarjeta: string, referencia: string): Promise<PaymentStatusDto> {
    await this.citizenService.findCard(this.dataSource, numeroTarjeta, false);
    let row = await this.findStatus(referencia);
    if (row.numeroTarjeta !== numeroTarjeta) throw new PaymentNotFound();
    if (SETTLEABLE.includes(row.estadoPago)) {
      await this.reconcile(row);
      row = await this.findStatus(referencia);
    }
    return toStatusDto(row);
  }

  // S7: asks QPayPro outside any DB transaction (no lock held during the
  // network round trip), then settles a confirmed answer like the relay.
  // Whatever QPayPro cannot confirm -- not found, an error, another amount, a
  // QPayPro id that already belongs to another payment, no
  // QPAYPRO_API_SECRET -- is "unknown" and changes nothing.
  protected async reconcile(payment: ReconcilablePayment): Promise<ReconcileOutcome> {
    const env = readQpayproEnv();
    if (!env.login || !env.privateKey || !env.apiSecret) return "unknown";

    let detail: QpayproTransactionDetail;
    try {
      detail = await this.client.getTransactionDetail(
        payment.idQpaypro ? { idTrans: payment.idQpaypro } : { fpSequence: fpSequenceFor(payment.referencia) },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`QPayPro query failed for ${payment.referencia}: ${redactSecrets(message)}`);
      return "unknown";
    }
    if (!detail.found) return "unknown";

    // Queried by idTrans, only that transaction counts. By x_fp_sequence a
    // retried checkout may list a rejected attempt and then the approval.
    // Either way, only transactions dated inside the window count (L10).
    const notBefore = new Date(payment.fechaTransaccion).getTime() - QUERY_SKEW_MINUTES * 60_000;
    const transactions = detail.transactions.filter(
      (tx) =>
        (!payment.idQpaypro || tx.idTransaction === payment.idQpaypro) &&
        tx.dateTransaction !== null &&
        ISO_DATE_TIME.test(tx.dateTransaction) &&
        Date.parse(tx.dateTransaction) >= notBefore,
    );
    const confirmed = transactions.find((tx) => tx.status === DETAIL_APPROVED) ?? transactions[transactions.length - 1];
    if (!confirmed) return "unknown";
    const approved = confirmed.status === DETAIL_APPROVED;

    try {
      return await this.dataSource.transaction(async (manager): Promise<ReconcileOutcome> => {
        // The row lock makes concurrent relays and queries settle once.
        const tx = await this.lockPayment(manager, payment.referencia);
        if (!tx || !SETTLEABLE.includes(tx.estado)) return "unknown";
        if (approved && !sameAmount(confirmed.amount, tx.monto)) {
          this.logger.warn(`QPayPro query for ${payment.referencia} ignored: amount does not match monto_pago`);
          return "unknown";
        }
        const owners = (await manager.query(
          `SELECT 1 FROM tbl_transaccion_pago WHERE id_transaccion_qpaypro = $1 AND id_transaccion_pago <> $2`,
          [confirmed.idTransaction, tx.id],
        )) as unknown[];
        if (owners.length > 0) {
          this.logger.warn(`QPayPro query for ${payment.referencia} ignored: its QPayPro id belongs to another payment`);
          return "unknown";
        }
        await this.settle(manager, tx, {
          approved,
          idQpaypro: confirmed.idTransaction,
          codigoRespuesta: confirmed.responseCode,
          numeroAutorizacion: confirmed.authorizationNumber,
        });
        return approved ? "approved" : "rejected";
      });
    } catch (error) {
      // Another payment took the same QPayPro id concurrently: rolled back.
      const driver = error instanceof QueryFailedError ? (error.driverError as { code?: string; constraint?: string }) : undefined;
      if (driver?.code === "23505" && driver.constraint === QPAYPRO_ID_UNIQUE) return "unknown";
      throw error;
    }
  }

  private async findStatus(referencia: string): Promise<PaymentStatusRow> {
    if (!isQpayproReference(referencia)) throw new PaymentNotFound();
    const rows = (await this.dataSource.query(
      `SELECT t.id_transaccion_pago AS "id", t.referencia_pago AS "referencia",
              t.id_transaccion_qpaypro AS "idQpaypro", k.numero_tarjeta AS "numeroTarjeta", t.monto_pago AS "monto", t.estado_pago AS "estadoPago",
              c.numero_comprobante AS "numeroComprobante", k.saldo AS "saldo",
              t.fecha_transaccion AS "fechaTransaccion",
              t.fecha_transaccion < CURRENT_TIMESTAMP - make_interval(mins => $2) AS "vencida"
         FROM tbl_transaccion_pago t
        INNER JOIN tbl_tarjeta_ciudadana k ON k.id_tarjeta_ciudadana = t.id_tarjeta_ciudadana
         LEFT JOIN tbl_recarga r ON r.id_transaccion_pago = t.id_transaccion_pago
         LEFT JOIN tbl_comprobante c ON c.id_recarga = r.id_recarga
        WHERE t.referencia_pago = $1`,
      [referencia, PAYMENT_EXPIRY_MINUTES],
    )) as PaymentStatusRow[];
    const row = rows[0];
    if (!row) throw new PaymentNotFound();
    return { ...row, id: String(row.id) };
  }

  private async lockPayment(manager: Queryable, referencia: string): Promise<PaymentLockRow | undefined> {
    const rows = (await manager.query(
      `SELECT id_transaccion_pago AS "id", id_tarjeta_ciudadana AS "idTarjeta",
              monto_pago AS "monto", estado_pago AS "estado"
         FROM tbl_transaccion_pago WHERE referencia_pago = $1
         FOR UPDATE`,
      [referencia],
    )) as PaymentLockRow[];
    const row = rows[0];
    return row ? { ...row, id: String(row.id), idTarjeta: String(row.idTarjeta) } : undefined;
  }

  // S3: every field the sandbox requires (L5), plus x_fp_sequence (L7, L10).
  private registerFields(
    config: QpayproCheckoutConfig,
    referencia: string,
    monto: string,
    email: string,
  ): Record<string, string> {
    return {
      x_login: config.login,
      x_api_key: config.apiKey,
      x_type: "AUTH_ONLY",
      x_method: "CC",
      x_visacuotas: "no",
      origen: "PLUGIN",
      store_type: "woocommerce",
      custom_fields: JSON.stringify({ order_id: referencia }),
      x_invoice_num: referencia,
      x_fp_sequence: fpSequenceFor(referencia),
      x_description: `Recarga Transmetro ${referencia}`,
      x_amount: monto,
      x_currency_code: "GTQ",
      // One line: name, sku, description, quantity, unit price, total.
      products: JSON.stringify([["Recarga Transmetro", referencia, "", "1", monto, monto]]),
      x_freight: "0",
      taxes: "0",
      x_discount: "0",
      x_first_name: "Consumidor",
      x_last_name: "Final",
      x_company: "C/F",
      x_email: email,
      x_address: "Ciudad de Guatemala",
      x_city: "Guatemala",
      x_state: "Guatemala",
      x_country: "Guatemala",
      x_zip: "01001",
      x_phone: "00000000",
      http_origin: new URL(config.apiPublicUrl).host,
      x_relay_url: `${config.apiPublicUrl}/citizen/payments/qpaypro/relay`,
      x_url_cancel: `${config.apiPublicUrl}/citizen/payments/qpaypro/cancel?referencia=${encodeURIComponent(referencia)}`,
    };
  }
}

function toStatusDto(row: PaymentStatusRow): PaymentStatusDto {
  return {
    referencia: row.referencia,
    numeroTarjeta: row.numeroTarjeta,
    monto: Number(row.monto),
    estadoPago: row.estadoPago,
    numeroComprobante: row.numeroComprobante ?? null,
    saldo: Number(row.saldo),
  };
}

function landingUrl(userWebUrl: string, pago: string): string {
  return `${userWebUrl}/?pago=${encodeURIComponent(pago)}`;
}
