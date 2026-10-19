// ============================================================================
// E2E for odd/tasks/qpaypro-checkout.md (S2-S7), against real Postgres: the
// QPayPro hosted checkout of card recharges. The QPayPro client is replaced
// by a fake (QPAYPRO_CLIENT), so no test reaches the sandbox; relays are
// signed here with the test private key, independently of the API code.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Requires
// apps/api/.env exported and database/init.sql applied. Everything created
// here is removed in afterAll.
// ============================================================================

process.env.ADMIN_WEB_ORIGINS ??= "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID ??= "test-client-id";

const QPP_ENV = {
  QPAYPRO_LOGIN: "e2e-login",
  QPAYPRO_API_KEY: "e2e-api-key",
  QPAYPRO_PRIVATE_KEY: "e2e-private-key",
  QPAYPRO_API_SECRET: "e2e-api-secret",
  QPAYPRO_BASE_URL: "https://qpp.test",
  API_PUBLIC_URL: "https://api.test",
  USER_WEB_URL: "https://user.test",
};
Object.assign(process.env, QPP_ENV);

import { createHash } from "node:crypto";

import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module.js";
import {
  QPAYPRO_CLIENT,
  QpayproClientError,
  type QpayproClient,
  type QpayproTransactionDetail,
  type QpayproTransactionQuery,
} from "../src/citizen/qpaypro/qpaypro.client.js";

type Fields = Record<string, string>;

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";
const NOT_FOUND: QpayproTransactionDetail = { found: false };

class FakeQpayproClient implements QpayproClient {
  calls: Fields[] = [];
  answer: (fields: Fields) => Promise<{ token: string }> = async () => ({ token: `tok-${this.calls.length}` });
  queries: QpayproTransactionQuery[] = [];
  detail: (query: QpayproTransactionQuery) => Promise<QpayproTransactionDetail> = async () => NOT_FOUND;

  registerTransaction(fields: Fields): Promise<{ token: string }> {
    this.calls.push({ ...fields });
    return this.answer(fields);
  }

  getTransactionDetail(query: QpayproTransactionQuery): Promise<QpayproTransactionDetail> {
    this.queries.push({ ...query });
    return this.detail(query);
  }
}

// QPayPro's date format (L10), microseconds included.
const qppDate = (date: Date) => date.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");

// A get_transaction_detail answer with one transaction (L7 shape, parsed),
// dated now unless `extra` says otherwise.
const detailOf = (
  idTransaction: string,
  status: string,
  amount: string,
  extra: { authorizationNumber?: string | null; responseCode?: string | null; dateTransaction?: string | null } = {},
) =>
  async (): Promise<QpayproTransactionDetail> => ({
    found: true,
    transactions: [
      { idTransaction, status, amount, authorizationNumber: "831000", responseCode: "100", dateTransaction: qppDate(new Date()), ...extra },
    ],
  });

// Independent of src/ (L10): the first 64 bits of sha256(referencia), mapped
// into [1000000000, 9999999999].
const fpSequenceOf = (referencia: string) =>
  String((BigInt(`0x${createHash("sha256").update(referencia).digest("hex").slice(0, 16)}`) % 9000000000n) + 1000000000n);

// Independent of src/: sha256(order_id|x_trans_id|x_amount|x_response_status|private_key).
const sign = (orderId: string, transId: string, amount: string, status: string, key = QPP_ENV.QPAYPRO_PRIVATE_KEY) =>
  createHash("sha256").update(`${orderId}|${transId}|${amount}|${status}|${key}`).digest("hex");

interface PaymentRow {
  id: string;
  estado: string;
  monto: string;
  moneda: string;
  qpaypro: string | null;
  codigo: string | null;
  autorizacion: string | null;
  mensaje: string | null;
  confirmada: Date | null;
}

describe("QPayPro checkout (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const fake = new FakeQpayproClient();

  const runTag = `E2E-QPP-${Date.now()}`;
  const ids = { tarjetas: [] as string[], employees: [] as string[] };
  let transSeq = 0;
  const nextTransId = () => `${Date.now()}${++transSeq}`;

  async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
    const [row] = (await dataSource.query(sql, params)) as T[];
    if (!row) throw new Error(`No row for: ${sql}`);
    return row;
  }

  async function createCard(suffix: string, saldo: string, estado = "ACTIVA"): Promise<string> {
    const numero = `${runTag}-${suffix}`;
    const card = await one<{ id: string }>(
      `INSERT INTO tbl_tarjeta_ciudadana (numero_tarjeta, saldo, estado_tarjeta)
       VALUES ($1, $2, $3) RETURNING id_tarjeta_ciudadana AS "id"`,
      [numero, saldo, estado],
    );
    ids.tarjetas.push(String(card.id));
    return numero;
  }

  const api = () => request(app.getHttpServer());
  const start = (numero: string, body: Record<string, unknown>) =>
    api().post(`/citizen/cards/${encodeURIComponent(numero)}/payments`).send(body);

  const saldoOf = async (numero: string) =>
    (await one<{ saldo: string }>(`SELECT saldo FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1`, [numero])).saldo;

  const paymentOf = (referencia: string) =>
    one<PaymentRow>(
      `SELECT id_transaccion_pago AS "id", estado_pago AS "estado", monto_pago AS "monto", moneda,
              id_transaccion_qpaypro AS "qpaypro", codigo_respuesta AS "codigo",
              numero_autorizacion AS "autorizacion", mensaje_respuesta AS "mensaje", fecha_confirmacion AS "confirmada"
         FROM tbl_transaccion_pago WHERE referencia_pago = $1`,
      [referencia],
    );

  // Every payment, recharge and receipt row of the run's cards, plus balances.
  const snapshot = async () =>
    one<{ tx: unknown; recargas: unknown; comprobantes: unknown; saldos: unknown }>(
      `SELECT (SELECT COALESCE(json_agg(t ORDER BY t.id_transaccion_pago), '[]') FROM tbl_transaccion_pago t
                WHERE t.id_tarjeta_ciudadana = ANY($1::bigint[])) AS "tx",
              (SELECT COALESCE(json_agg(r ORDER BY r.id_recarga), '[]') FROM tbl_recarga r
                WHERE r.id_tarjeta_ciudadana = ANY($1::bigint[])) AS "recargas",
              (SELECT COALESCE(json_agg(c ORDER BY c.id_comprobante), '[]') FROM tbl_comprobante c
                JOIN tbl_recarga r ON r.id_recarga = c.id_recarga
                WHERE r.id_tarjeta_ciudadana = ANY($1::bigint[])) AS "comprobantes",
              (SELECT COALESCE(json_agg(json_build_array(k.id_tarjeta_ciudadana, k.saldo) ORDER BY k.id_tarjeta_ciudadana), '[]')
                 FROM tbl_tarjeta_ciudadana k WHERE k.id_tarjeta_ciudadana = ANY($1::bigint[])) AS "saldos"`,
      [ids.tarjetas],
    );

  const withEnv = async (changes: Record<string, string | undefined>, run: () => Promise<void>) => {
    const saved = Object.fromEntries(Object.keys(changes).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      await run();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(QPAYPRO_CLIENT)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);
  });

  beforeEach(() => {
    fake.calls = [];
    fake.answer = async () => ({ token: `tok-${fake.calls.length}` });
    fake.queries = [];
    fake.detail = async () => NOT_FOUND;
  });

  afterAll(async () => {
    if (dataSource && ids.tarjetas.length) {
      const q = (sql: string) => dataSource.query(sql, [ids.tarjetas]);
      await q(
        `DELETE FROM tbl_comprobante WHERE id_recarga IN (SELECT id_recarga FROM tbl_recarga WHERE id_tarjeta_ciudadana = ANY($1::bigint[]))`,
      );
      await q(`DELETE FROM tbl_recarga WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`);
      await q(`DELETE FROM tbl_transaccion_pago WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`);
      await q(`DELETE FROM tbl_tarjeta_ciudadana WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`);
    }
    if (dataSource && ids.employees.length) {
      await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [ids.employees]);
    }
    if (app) await app.close();
  });

  describe("start payment (S2, S3)", () => {
    it("stores one INICIADA transaction, registers it with QPayPro and answers the checkout URL (201)", async () => {
      const card = await createCard("start", "3.00");

      const res = await start(card, { monto: 25, email: "ana@example.com" });

      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(["checkoutUrl", "referencia"]);
      const referencia = res.body.referencia as string;
      expect(referencia).toMatch(/^QPP-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(res.body.checkoutUrl).toBe("https://qpp.test/checkout/woocommerce?token=tok-1");

      const row = await paymentOf(referencia);
      expect(row).toMatchObject({ estado: "INICIADA", monto: "25.00", moneda: "GTQ", qpaypro: null, codigo: null, mensaje: null, confirmada: null });
      expect(await saldoOf(card)).toBe("3.00");
      const stored = JSON.stringify(await snapshot());
      expect(stored).not.toContain("ana@example.com");
      expect((await snapshot()).recargas).toEqual([]);

      expect(fake.calls).toHaveLength(1);
      expect(fake.calls[0]).toEqual({
        x_login: "e2e-login",
        x_api_key: "e2e-api-key",
        x_type: "AUTH_ONLY",
        x_method: "CC",
        x_visacuotas: "no",
        origen: "PLUGIN",
        store_type: "woocommerce",
        custom_fields: JSON.stringify({ order_id: referencia }),
        x_invoice_num: referencia,
        x_fp_sequence: fpSequenceOf(referencia),
        x_description: `Recarga Transmetro ${referencia}`,
        x_amount: "25.00",
        x_currency_code: "GTQ",
        products: JSON.stringify([["Recarga Transmetro", referencia, "", "1", "25.00", "25.00"]]),
        x_freight: "0",
        taxes: "0",
        x_discount: "0",
        x_first_name: "Consumidor",
        x_last_name: "Final",
        x_company: "C/F",
        x_email: "ana@example.com",
        x_address: "Ciudad de Guatemala",
        x_city: "Guatemala",
        x_state: "Guatemala",
        x_country: "Guatemala",
        x_zip: "01001",
        x_phone: "00000000",
        http_origin: "api.test",
        x_relay_url: "https://api.test/citizen/payments/qpaypro/relay",
        x_url_cancel: `https://api.test/citizen/payments/qpaypro/cancel?referencia=${referencia}`,
      });
      const sent = JSON.stringify(fake.calls[0]);
      expect(sent).not.toContain(QPP_ENV.QPAYPRO_PRIVATE_KEY);
      expect(sent).not.toContain(QPP_ENV.QPAYPRO_API_SECRET);
    });

    it.each([10, 50, 100])("accepts monto %s", async (monto) => {
      const card = await createCard(`amount-${monto}`, "0.00");

      const res = await start(card, { monto, email: "ana@example.com" });

      expect(res.status).toBe(201);
      expect((await paymentOf(res.body.referencia)).monto).toBe(monto.toFixed(2));
      expect(fake.calls[0]!.x_amount).toBe(monto.toFixed(2));
    });

    it("generates a new referencia for every attempt", async () => {
      const card = await createCard("twice", "0.00");

      const first = await start(card, { monto: 10, email: "ana@example.com" });
      const second = await start(card, { monto: 10, email: "ana@example.com" });

      expect(first.body.referencia).not.toBe(second.body.referencia);
    });

    it.each(["QPAYPRO_LOGIN", "QPAYPRO_API_KEY", "QPAYPRO_PRIVATE_KEY", "API_PUBLIC_URL", "USER_WEB_URL"])(
      "answers 503 and stores nothing without %s",
      async (name) => {
        const card = await createCard(`noenv-${name}`, "4.00");
        const before = await snapshot();

        await withEnv({ [name]: undefined }, async () => {
          const res = await start(card, { monto: 10, email: "ana@example.com" });

          expect(res.status).toBe(503);
          expect(res.body.message).toBe("Los pagos con QPayPro no están disponibles.");
        });

        expect(fake.calls).toEqual([]);
        expect(await snapshot()).toEqual(before);
      },
    );

    it("does not need QPAYPRO_API_SECRET to start a payment", async () => {
      const card = await createCard("nosecret", "0.00");

      await withEnv({ QPAYPRO_API_SECRET: undefined }, async () => {
        expect((await start(card, { monto: 10, email: "ana@example.com" })).status).toBe(201);
      });
    });

    it("marks the transaction ERROR with QPayPro's message and answers 502 when registration fails", async () => {
      const card = await createCard("fail", "4.00");
      fake.answer = async () => {
        throw new QpayproClientError("x_login / x_api_key inactive or does not exists");
      };

      const res = await start(card, { monto: 10, email: "ana@example.com" });

      expect(res.status).toBe(502);
      expect(res.body.message).toBe("No se pudo iniciar el pago con QPayPro.");
      const row = await paymentOf(fake.calls[0]!.x_invoice_num!);
      expect(row).toMatchObject({ estado: "ERROR", monto: "10.00", mensaje: "x_login / x_api_key inactive or does not exists", qpaypro: null });
      expect(await saldoOf(card)).toBe("4.00");
      expect((await snapshot()).recargas).toEqual([]);
    });

    it("never stores a credential in mensaje_respuesta", async () => {
      const card = await createCard("fail-secret", "4.00");
      fake.answer = async () => {
        throw new Error(`boom ${QPP_ENV.QPAYPRO_API_KEY} ${QPP_ENV.QPAYPRO_PRIVATE_KEY}`);
      };

      const res = await start(card, { monto: 10, email: "ana@example.com" });

      expect(res.status).toBe(502);
      const row = await paymentOf(fake.calls[0]!.x_invoice_num!);
      expect(row.estado).toBe("ERROR");
      expect(row.mensaje).toBe("boom *** ***");
    });

    it("answers 404 for an unknown card and 409 for a card that is not ACTIVA, storing nothing", async () => {
      const blocked = await createCard("blocked", "5.00", "BLOQUEADA");
      const before = await snapshot();

      const missing = await start(`${runTag}-none`, { monto: 10, email: "ana@example.com" });
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe("La tarjeta no existe.");
      const conflict = await start(blocked, { monto: 10, email: "ana@example.com" });
      expect(conflict.status).toBe(409);
      expect(conflict.body.message).toBe("La tarjeta está BLOQUEADA y no puede recargarse.");

      expect(fake.calls).toEqual([]);
      expect(await snapshot()).toEqual(before);
    });

    it.each([
      ["monto 9", { monto: 9, email: "ana@example.com" }],
      ["monto 10.5", { monto: 10.5, email: "ana@example.com" }],
      ['monto "10"', { monto: "10", email: "ana@example.com" }],
      ["monto 0", { monto: 0, email: "ana@example.com" }],
      ["a bad email", { monto: 10, email: "ana" }],
      ["no email", { monto: 10 }],
    ])("rejects %s with 400, storing nothing", async (_label, body) => {
      const card = await createCard(`bad-${_label.replace(/\W/g, "")}`, "5.00");
      const before = await snapshot();

      expect((await start(card, body)).status).toBe(400);

      expect(fake.calls).toEqual([]);
      expect(await snapshot()).toEqual(before);
    });
  });

  // A started payment of `monto` on a new card with balance `saldo`.
  async function started(suffix: string, saldo = "3.00", monto = 25): Promise<{ card: string; referencia: string }> {
    const card = await createCard(suffix, saldo);
    const res = await start(card, { monto, email: "ana@example.com" });
    expect(res.status).toBe(201);
    return { card, referencia: res.body.referencia as string };
  }

  const relay = (params: Record<string, string>) => api().get("/citizen/payments/qpaypro/relay").query(params);
  const relayParams = (referencia: string, amount: string, status: string, transId = nextTransId()) => ({
    order_id: referencia,
    x_trans_id: transId,
    x_amount: amount,
    x_response_status: status,
    order_hash: sign(referencia, transId, amount, status),
  });
  const cancel = (query: Record<string, string>) => api().get("/citizen/payments/qpaypro/cancel").query(query);
  const status = (referencia: string) => api().get(`/citizen/payments/${encodeURIComponent(referencia)}`);
  const landing = (pago: string) => `https://user.test/?pago=${pago}`;

  const rechargesOf = (referencia: string) =>
    dataSource.query(
      `SELECT r.id_recarga AS "idRecarga", r.monto_recarga AS "monto", c.numero_comprobante AS "comprobante"
         FROM tbl_recarga r
         JOIN tbl_transaccion_pago t ON t.id_transaccion_pago = r.id_transaccion_pago
         LEFT JOIN tbl_comprobante c ON c.id_recarga = r.id_recarga
        WHERE t.referencia_pago = $1`,
      [referencia],
    ) as Promise<{ idRecarga: string; monto: string; comprobante: string | null }[]>;

  describe("relay (S4)", () => {
    it("credits a signed approval once: APROBADA, one recharge with its QPP-REC receipt, balance + monto, 302", async () => {
      const { card, referencia } = await started("approve");
      const params = relayParams(referencia, "25.00", "1");

      const res = await relay(params);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      const row = await paymentOf(referencia);
      expect(row).toMatchObject({ estado: "APROBADA", qpaypro: params.x_trans_id, codigo: "1", monto: "25.00" });
      expect(row.confirmada).not.toBeNull();
      const recargas = await rechargesOf(referencia);
      expect(recargas).toHaveLength(1);
      expect(recargas[0]).toMatchObject({ monto: "25.00", comprobante: `QPP-REC-${recargas[0]!.idRecarga}` });
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("marks a signed rejection RECHAZADA without a recharge or a balance change", async () => {
      const { card, referencia } = await started("reject");
      const params = relayParams(referencia, "25.00", "2");

      const res = await relay(params);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      const row = await paymentOf(referencia);
      expect(row).toMatchObject({ estado: "RECHAZADA", qpaypro: params.x_trans_id, codigo: "2" });
      expect(row.confirmada).not.toBeNull();
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    const tampered: [string, (p: Record<string, string>) => Record<string, string>][] = [
      ["a hash signed with another key", (p) => ({ ...p, order_hash: sign(p.order_id!, p.x_trans_id!, "25.00", "1", "other-key") })],
      ["a status changed after signing", (p) => ({ ...p, x_response_status: "1" })],
      ["an amount changed after signing", (p) => ({ ...p, x_amount: "25.0" })],
      ["a validly signed wrong amount", (p) => relayParams(p.order_id!, "26.00", "1", p.x_trans_id)],
      ["no x_trans_id", ({ x_trans_id: _drop, ...p }) => p],
      ["no x_amount", ({ x_amount: _drop, ...p }) => p],
      ["no x_response_status", ({ x_response_status: _drop, ...p }) => p],
      ["no order_hash", ({ order_hash: _drop, ...p }) => p],
    ];
    let forged = 0;
    it.each(tampered)("changes nothing for %s and still redirects", async (_label, change) => {
      const { referencia } = await started(`forged-${++forged}`);
      const before = await snapshot();

      const res = await relay(change(relayParams(referencia, "25.00", "2")));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      expect(await snapshot()).toEqual(before);
      expect((await paymentOf(referencia)).estado).toBe("INICIADA");
    });

    it("changes nothing for a repeated relay: still exactly one recharge", async () => {
      const { card, referencia } = await started("dup");
      const params = relayParams(referencia, "25.00", "1");
      await relay(params);
      const before = await snapshot();

      const again = await relay(params);
      const rejection = await relay(relayParams(referencia, "25.00", "2"));

      expect(again.status).toBe(302);
      expect(rejection.status).toBe(302);
      expect(await snapshot()).toEqual(before);
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("credits exactly once when the same approval arrives concurrently", async () => {
      const { card, referencia } = await started("race");
      const params = relayParams(referencia, "25.00", "1");

      const answers = await Promise.all(Array.from({ length: 5 }, () => relay(params)));

      expect(answers.map((res) => res.status)).toEqual([302, 302, 302, 302, 302]);
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("credits a signed approval that arrives after the payment EXPIRADA", async () => {
      const { card, referencia } = await started("late");
      await cancel({ referencia });
      expect((await paymentOf(referencia)).estado).toBe("EXPIRADA");

      await relay(relayParams(referencia, "25.00", "1"));

      expect((await paymentOf(referencia)).estado).toBe("APROBADA");
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("credits a signed approval that arrives after a declined attempt RECHAZADA (L12)", async () => {
      const { card, referencia } = await started("retry-after-reject");
      await relay(relayParams(referencia, "25.00", "2"));
      expect((await paymentOf(referencia)).estado).toBe("RECHAZADA");
      const params = relayParams(referencia, "25.00", "1");

      const res = await relay(params);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      expect(await paymentOf(referencia)).toMatchObject({ estado: "APROBADA", qpaypro: params.x_trans_id, codigo: "1" });
      const recargas = await rechargesOf(referencia);
      expect(recargas).toHaveLength(1);
      expect(recargas[0]).toMatchObject({ monto: "25.00", comprobante: `QPP-REC-${recargas[0]!.idRecarga}` });
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("never overwrites APROBADA with a signed rejection", async () => {
      const { card, referencia } = await started("approved-then-reject");
      await relay(relayParams(referencia, "25.00", "1"));
      const before = await snapshot();

      const res = await relay(relayParams(referencia, "25.00", "2"));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      expect(await snapshot()).toEqual(before);
      expect((await paymentOf(referencia)).estado).toBe("APROBADA");
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("accepts an upper-case order_hash and credits once", async () => {
      const { card, referencia } = await started("upper-hash");
      const params = relayParams(referencia, "25.00", "1");
      const upper = { ...params, order_hash: params.order_hash.toUpperCase() };

      const res = await relay(upper);
      await relay(upper);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      expect((await paymentOf(referencia)).estado).toBe("APROBADA");
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("verifies the signature over x_amount exactly as sent (\"25\")", async () => {
      const { card, referencia } = await started("raw-amount");

      const res = await relay(relayParams(referencia, "25", "1"));

      expect(res.status).toBe(302);
      expect((await paymentOf(referencia)).estado).toBe("APROBADA");
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("redirects to ?pago=desconocido for a repeated order_id, changing nothing", async () => {
      const { referencia } = await started("repeated-order");
      const params = relayParams(referencia, "25.00", "1");
      const before = await snapshot();
      const query = new URLSearchParams([["order_id", referencia], ...Object.entries(params)]).toString();

      const res = await api().get(`/citizen/payments/qpaypro/relay?${query}`);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing("desconocido"));
      expect(await snapshot()).toEqual(before);
    });

    it("changes nothing for a signed relay whose x_trans_id belongs to another approved payment", async () => {
      const owner = await started("relay-owner");
      const ownerParams = relayParams(owner.referencia, "25.00", "1");
      await relay(ownerParams);
      const { card, referencia } = await started("relay-dup-id");
      const before = await snapshot();

      const res = await relay(relayParams(referencia, "25.00", "1", ownerParams.x_trans_id));

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      expect(await snapshot()).toEqual(before);
      expect(await paymentOf(referencia)).toMatchObject({ estado: "INICIADA", qpaypro: null, codigo: null, confirmada: null });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
      expect(await rechargesOf(owner.referencia)).toHaveLength(1);
    });

    it("changes nothing for a transaction in ERROR", async () => {
      const card = await createCard("relay-error", "3.00");
      fake.answer = async () => {
        throw new QpayproClientError("down");
      };
      await start(card, { monto: 25, email: "ana@example.com" });
      const referencia = fake.calls[0]!.x_invoice_num!;
      const before = await snapshot();

      const res = await relay(relayParams(referencia, "25.00", "1"));

      expect(res.headers.location).toBe(landing(referencia));
      expect(await snapshot()).toEqual(before);
    });

    it("redirects to ?pago=desconocido for an order_id that matches no QPayPro transaction", async () => {
      const card = await createCard("relay-sim", "3.00");
      const simulated = `${runTag}-simulated`;
      await dataSource.query(
        `INSERT INTO tbl_transaccion_pago (id_tarjeta_ciudadana, referencia_pago, monto_pago, estado_pago)
         SELECT id_tarjeta_ciudadana, $2, 25, 'INICIADA' FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1`,
        [card, simulated],
      );
      const before = await snapshot();

      const unknown = await relay(relayParams("QPP-00000000-0000-4000-8000-000000000000", "25.00", "1"));
      const notQpaypro = await relay(relayParams(simulated, "25.00", "1"));
      const noOrder = await relay({ x_trans_id: "1", x_amount: "25.00", x_response_status: "1", order_hash: "x" });

      for (const res of [unknown, notQpaypro, noOrder]) {
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(landing("desconocido"));
      }
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("cancel (S5)", () => {
    it("marks an INICIADA payment EXPIRADA and redirects to ?pago=<referencia>", async () => {
      const { card, referencia } = await started("cancel");

      const res = await cancel({ referencia });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      expect((await paymentOf(referencia)).estado).toBe("EXPIRADA");
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("leaves any other state unchanged", async () => {
      const { referencia } = await started("cancel-approved");
      await relay(relayParams(referencia, "25.00", "1"));
      const before = await snapshot();

      const res = await cancel({ referencia });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(landing(referencia));
      expect(await snapshot()).toEqual(before);
      expect((await paymentOf(referencia)).estado).toBe("APROBADA");
    });

    it("redirects to ?pago=desconocido for an unknown or missing referencia", async () => {
      await createCard("cancel-none", "3.00");
      const before = await snapshot();

      for (const query of [{ referencia: "QPP-00000000-0000-4000-8000-000000000000" }, {}]) {
        const res = await cancel(query);
        expect(res.status).toBe(302);
        expect(res.headers.location).toBe(landing("desconocido"));
      }
      expect(await snapshot()).toEqual(before);
    });
  });

  describe("status (S6)", () => {
    const backdate = (referencia: string, minutes: number) =>
      dataSource.query(
        `UPDATE tbl_transaccion_pago SET fecha_transaccion = CURRENT_TIMESTAMP - make_interval(mins => $2)
          WHERE referencia_pago = $1`,
        [referencia, minutes],
      );

    it("answers a pending payment with the current balance", async () => {
      const { card, referencia } = await started("status");

      const res = await status(referencia);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        referencia,
        numeroTarjeta: card,
        monto: 25,
        estadoPago: "INICIADA",
        numeroComprobante: null,
        saldo: 3,
      });
    });

    it("answers an approved payment with its receipt and the new balance", async () => {
      const { card, referencia } = await started("status-ok");
      await relay(relayParams(referencia, "25.00", "1"));
      const [recarga] = await rechargesOf(referencia);

      const res = await status(referencia);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        referencia,
        numeroTarjeta: card,
        monto: 25,
        estadoPago: "APROBADA",
        numeroComprobante: `QPP-REC-${recarga!.idRecarga}`,
        saldo: 28,
      });
    });

    it("answers 404 for an unknown referencia and for a simulated one", async () => {
      const card = await createCard("status-sim", "3.00");
      const simulated = `${runTag}-status-sim`;
      await dataSource.query(
        `INSERT INTO tbl_transaccion_pago (id_tarjeta_ciudadana, referencia_pago, monto_pago, estado_pago)
         SELECT id_tarjeta_ciudadana, $2, 25, 'APROBADA' FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1`,
        [card, simulated],
      );

      for (const referencia of ["QPP-00000000-0000-4000-8000-000000000000", simulated]) {
        const res = await status(referencia);
        expect(res.status).toBe(404);
        expect(res.body.message).toBe("El pago no existe.");
      }
    });

    it("expires an INICIADA payment older than 10 minutes before answering", async () => {
      const { card, referencia } = await started("stale");
      await backdate(referencia, 11);

      const res = await status(referencia);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estadoPago: "EXPIRADA", numeroComprobante: null, saldo: 3 });
      expect((await paymentOf(referencia)).estado).toBe("EXPIRADA");
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("keeps an INICIADA payment younger than 10 minutes", async () => {
      const { referencia } = await started("fresh");
      await backdate(referencia, 9);

      expect((await status(referencia)).body.estadoPago).toBe("INICIADA");
      expect((await paymentOf(referencia)).estado).toBe("INICIADA");
    });

    it("never expires a payment that is not INICIADA", async () => {
      const { referencia } = await started("stale-rejected");
      await relay(relayParams(referencia, "25.00", "2"));
      await backdate(referencia, 30);
      const before = await snapshot();

      expect((await status(referencia)).body.estadoPago).toBe("RECHAZADA");
      expect(await snapshot()).toEqual(before);
    });
  });

  const backdateBy = (referencia: string, minutes: number) =>
    dataSource.query(
      `UPDATE tbl_transaccion_pago SET fecha_transaccion = CURRENT_TIMESTAMP - make_interval(mins => $2)
        WHERE referencia_pago = $1`,
      [referencia, minutes],
    );

  // A stale (11 min) INICIADA payment, ready for the S6 reconciliation.
  async function stale(suffix: string, saldo = "3.00", monto = 25) {
    const payment = await started(suffix, saldo, monto);
    await backdateBy(payment.referencia, 11);
    return payment;
  }

  // The row must be untouched apart from estado_pago.
  const unsettled = { qpaypro: null, codigo: null, autorizacion: null, confirmada: null };

  describe("reconciliation in status (S6, S7)", () => {
    it("credits a stale payment QPayPro reports Aprobada, querying by x_fp_sequence", async () => {
      const { card, referencia } = await stale("rec-ok");
      fake.detail = detailOf("900001", "Aprobada", "25.00");

      const res = await status(referencia);

      expect(fake.queries).toEqual([{ fpSequence: fpSequenceOf(referencia) }]);
      expect(res.status).toBe(200);
      const recargas = await rechargesOf(referencia);
      expect(recargas).toHaveLength(1);
      expect(recargas[0]).toMatchObject({ monto: "25.00", comprobante: `QPP-REC-${recargas[0]!.idRecarga}` });
      expect(res.body).toEqual({
        referencia,
        numeroTarjeta: card,
        monto: 25,
        estadoPago: "APROBADA",
        numeroComprobante: `QPP-REC-${recargas[0]!.idRecarga}`,
        saldo: 28,
      });
      const row = await paymentOf(referencia);
      expect(row).toMatchObject({ estado: "APROBADA", qpaypro: "900001", codigo: "100", autorizacion: "831000" });
      expect(row.confirmada).not.toBeNull();
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("queries by idTrans when the payment already has a QPayPro id", async () => {
      const { card, referencia } = await stale("rec-idtrans");
      const transId = nextTransId();
      await dataSource.query(`UPDATE tbl_transaccion_pago SET id_transaccion_qpaypro = $2 WHERE referencia_pago = $1`, [
        referencia,
        transId,
      ]);
      fake.detail = detailOf(transId, "Aprobada", "25.00");

      const res = await status(referencia);

      expect(fake.queries).toEqual([{ idTrans: transId }]);
      expect(res.body.estadoPago).toBe("APROBADA");
      expect((await paymentOf(referencia)).qpaypro).toBe(transId);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("marks RECHAZADA a payment QPayPro reports Rechazada, without a recharge", async () => {
      const { card, referencia } = await stale("rec-rejected");
      fake.detail = detailOf("900002", "Rechazada", "25.00", { authorizationNumber: null, responseCode: "05" });

      const res = await status(referencia);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estadoPago: "RECHAZADA", numeroComprobante: null, saldo: 3 });
      const row = await paymentOf(referencia);
      expect(row).toMatchObject({ estado: "RECHAZADA", qpaypro: "900002", codigo: "05", autorizacion: null });
      expect(row.confirmada).not.toBeNull();
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("ends RECHAZADA, not EXPIRADA, for a stale payment QPayPro reports Rechazada", async () => {
      const { referencia } = await stale("rec-stale-rejected");
      fake.detail = detailOf("900013", "Rechazada", "25.00", { authorizationNumber: null, responseCode: "05" });

      expect((await status(referencia)).body.estadoPago).toBe("RECHAZADA");
      expect((await paymentOf(referencia)).estado).toBe("RECHAZADA");
    });

    it("marks RECHAZADA a payment QPayPro reports Denegada", async () => {
      const { card, referencia } = await stale("rec-denied");
      fake.detail = detailOf("900014", "Denegada", "25.00", { authorizationNumber: null, responseCode: "05" });

      expect((await status(referencia)).body.estadoPago).toBe("RECHAZADA");
      expect(await paymentOf(referencia)).toMatchObject({ estado: "RECHAZADA", qpaypro: "900014", codigo: "05" });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("treats a Pendiente status as unknown: a stale payment only expires (L12)", async () => {
      const { card, referencia } = await stale("rec-pending");
      const before = await paymentOf(referencia);
      fake.detail = detailOf("900015", "Pendiente", "25.00", { authorizationNumber: null, responseCode: null });

      const res = await status(referencia);

      expect(fake.queries).toHaveLength(1);
      expect(res.body).toMatchObject({ estadoPago: "EXPIRADA", numeroComprobante: null, saldo: 3 });
      expect(await paymentOf(referencia)).toEqual({ ...before, estado: "EXPIRADA" });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    const unknowns: [string, () => Promise<QpayproTransactionDetail>][] = [
      ["an approval of another amount", detailOf("900003", "Aprobada", "26.00")],
      ["an approval for another QPayPro id", detailOf("900008", "Aprobada", "25.00")],
      ["not found", async () => NOT_FOUND],
      [
        "an error",
        async () => {
          throw new QpayproClientError("QPayPro did not answer within 15 s");
        },
      ],
    ];
    let unknownSeq = 0;
    it.each(unknowns)("expires the payment and changes nothing else for %s", async (label, answer) => {
      const { card, referencia } = await stale(`rec-unknown-${++unknownSeq}`);
      if (label === "an approval for another QPayPro id") {
        // Queried by idTrans: an answer about another transaction is ignored.
        await dataSource.query(`UPDATE tbl_transaccion_pago SET id_transaccion_qpaypro = $2 WHERE referencia_pago = $1`, [
          referencia,
          nextTransId(),
        ]);
      }
      const before = await paymentOf(referencia);
      fake.detail = answer;

      const res = await status(referencia);

      expect(fake.queries).toHaveLength(1);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estadoPago: "EXPIRADA", numeroComprobante: null, saldo: 3 });
      expect(await paymentOf(referencia)).toEqual({ ...before, estado: "EXPIRADA" });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("does not query QPayPro without QPAYPRO_API_SECRET and only expires", async () => {
      const { card, referencia } = await stale("rec-nosecret");
      fake.detail = detailOf("900004", "Aprobada", "25.00");

      await withEnv({ QPAYPRO_API_SECRET: undefined }, async () => {
        expect((await status(referencia)).body.estadoPago).toBe("EXPIRADA");
      });

      expect(fake.queries).toEqual([]);
      expect(await paymentOf(referencia)).toMatchObject({ estado: "EXPIRADA", ...unsettled });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("treats as unknown an approval whose QPayPro id already belongs to another payment", async () => {
      const other = await started("rec-owner");
      const ownerParams = relayParams(other.referencia, "25.00", "1");
      await relay(ownerParams);
      const { card, referencia } = await stale("rec-dup-id");
      const ownerBefore = await paymentOf(other.referencia);
      fake.detail = detailOf(ownerParams.x_trans_id, "Aprobada", "25.00");

      const res = await status(referencia);

      expect(res.status).toBe(200);
      expect(res.body.estadoPago).toBe("EXPIRADA");
      expect(await paymentOf(referencia)).toMatchObject({ estado: "EXPIRADA", ...unsettled });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
      expect(await paymentOf(other.referencia)).toEqual(ownerBefore);
      expect(await rechargesOf(other.referencia)).toHaveLength(1);
    });

    it("credits the approved transaction when the x_fp_sequence also matches a rejected attempt", async () => {
      const { card, referencia } = await stale("rec-retry");
      fake.detail = async () => ({
        found: true,
        transactions: [
          { idTransaction: "900005", status: "Rechazada", amount: "25.00", authorizationNumber: null, responseCode: "05", dateTransaction: qppDate(new Date()) },
          { idTransaction: "900006", status: "Aprobada", amount: "25.00", authorizationNumber: "831001", responseCode: "100", dateTransaction: qppDate(new Date()) },
        ],
      });

      expect((await status(referencia)).body.estadoPago).toBe("APROBADA");

      expect(await paymentOf(referencia)).toMatchObject({ qpaypro: "900006", autorizacion: "831001" });
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    // L10: the shared sandbox login may hold another merchant's older
    // transaction under the same fp sequence or id.
    const fechaOf = async (referencia: string) =>
      (await one<{ fecha: Date }>(`SELECT fecha_transaccion AS "fecha" FROM tbl_transaccion_pago WHERE referencia_pago = $1`, [referencia]))
        .fecha;
    const minutesFrom = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

    it.each([
      ["dated 6 minutes before the payment", "fpSequence", (fecha: Date) => qppDate(minutesFrom(fecha, -6))],
      ["dated 6 minutes before the payment, queried by idTrans", "idTrans", (fecha: Date) => qppDate(minutesFrom(fecha, -6))],
      ["with an unparseable date", "fpSequence", () => "28/07/2021 20:13"],
      ["without a date", "fpSequence", () => null],
    ])("ignores an approval %s: EXPIRADA, nothing else changes", async (_label, by, dateOf) => {
      const { card, referencia } = await stale(`rec-old-${by}-${++unknownSeq}`);
      const transId = nextTransId();
      if (by === "idTrans") {
        await dataSource.query(`UPDATE tbl_transaccion_pago SET id_transaccion_qpaypro = $2 WHERE referencia_pago = $1`, [
          referencia,
          transId,
        ]);
      }
      const before = await paymentOf(referencia);
      fake.detail = detailOf(transId, "Aprobada", "25.00", { dateTransaction: dateOf(await fechaOf(referencia)) });

      const res = await status(referencia);

      expect(fake.queries).toEqual([by === "idTrans" ? { idTrans: transId } : { fpSequence: fpSequenceOf(referencia) }]);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estadoPago: "EXPIRADA", numeroComprobante: null, saldo: 3 });
      expect(await paymentOf(referencia)).toEqual({ ...before, estado: "EXPIRADA" });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("ignores a rejection dated before the window too", async () => {
      const { card, referencia } = await stale("rec-old-rejected");
      fake.detail = detailOf("900009", "Rechazada", "25.00", { dateTransaction: qppDate(minutesFrom(await fechaOf(referencia), -6)) });

      expect((await status(referencia)).body.estadoPago).toBe("EXPIRADA");
      expect(await paymentOf(referencia)).toMatchObject({ estado: "EXPIRADA", ...unsettled });
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("credits an approval dated 4 minutes before the payment (clock skew)", async () => {
      const { card, referencia } = await stale("rec-skew");
      fake.detail = detailOf("900010", "Aprobada", "25.00", { dateTransaction: qppDate(minutesFrom(await fechaOf(referencia), -4)) });

      expect((await status(referencia)).body.estadoPago).toBe("APROBADA");
      expect(await paymentOf(referencia)).toMatchObject({ estado: "APROBADA", qpaypro: "900010" });
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("credits the in-window approval when an older one shares the fp sequence", async () => {
      const { card, referencia } = await stale("rec-mixed");
      const fecha = await fechaOf(referencia);
      fake.detail = async () => ({
        found: true,
        transactions: [
          { idTransaction: "900011", status: "Aprobada", amount: "25.00", authorizationNumber: "1", responseCode: "100", dateTransaction: qppDate(minutesFrom(fecha, -60)) },
          { idTransaction: "900012", status: "Rechazada", amount: "25.00", authorizationNumber: null, responseCode: "05", dateTransaction: qppDate(minutesFrom(fecha, 1)) },
        ],
      });

      expect((await status(referencia)).body.estadoPago).toBe("RECHAZADA");
      expect(await paymentOf(referencia)).toMatchObject({ estado: "RECHAZADA", qpaypro: "900012" });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("does not query QPayPro for a fresh INICIADA payment", async () => {
      const { referencia } = await started("rec-fresh");
      fake.detail = detailOf("900007", "Aprobada", "25.00");

      expect((await status(referencia)).body.estadoPago).toBe("INICIADA");
      expect(fake.queries).toEqual([]);
    });
  });

  describe("staff verify (S7)", () => {
    let centralToken = "";
    let pilotToken = "";

    async function createEmployee(roleCode: string, suffix: string): Promise<string> {
      const role = await one<{ idRol: string }>(`SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`, [roleCode]);
      const email = `${runTag.toLowerCase()}-${suffix}@transmetro.gt`;
      const emp = await one<{ id: string }>(
        `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
         VALUES ($1, 'ACTIVO', $2, $3) RETURNING id_emple AS "id"`,
        [`${runTag} ${suffix}`, email, role.idRol],
      );
      ids.employees.push(String(emp.id));
      const permissions = (
        (await dataSource.query(
          `SELECT p.codigo_permiso AS "codigo" FROM tbl_rol r
           JOIN tbl_rol_permiso rp ON rp.id_rol = r.id_rol
           JOIN tbl_permiso p ON p.id_permiso = rp.id_permiso WHERE r.codigo = $1`,
          [roleCode],
        )) as { codigo: string }[]
      ).map((r) => r.codigo);
      return jwt.sign(
        { employeeId: String(emp.id), email, roles: [roleCode], permissions, scope: { role: roleCode, modules: [] } },
        JWT_SECRET,
        { expiresIn: "12h" },
      );
    }

    beforeAll(async () => {
      centralToken = await createEmployee("OPERADOR_CENTRAL", "central");
      pilotToken = await createEmployee("PILOTO", "pilot");
    });

    const verify = (card: string, referencia: string, token: string | null = centralToken) => {
      const req = api().post(`/cards/${encodeURIComponent(card)}/payments/${encodeURIComponent(referencia)}/verify`);
      return token === null ? req : req.set("Authorization", `Bearer ${token}`);
    };

    it("credits a fresh INICIADA payment QPayPro reports Aprobada and answers the S6 body", async () => {
      const { card, referencia } = await started("verify-ok");
      fake.detail = detailOf("910001", "Aprobada", "25.00");

      const res = await verify(card, referencia);

      expect(fake.queries).toEqual([{ fpSequence: fpSequenceOf(referencia) }]);
      expect(res.status).toBe(200);
      const recargas = await rechargesOf(referencia);
      expect(recargas).toHaveLength(1);
      expect(res.body).toEqual({
        referencia,
        numeroTarjeta: card,
        monto: 25,
        estadoPago: "APROBADA",
        numeroComprobante: `QPP-REC-${recargas[0]!.idRecarga}`,
        saldo: 28,
      });
      expect(await paymentOf(referencia)).toMatchObject({ estado: "APROBADA", qpaypro: "910001", codigo: "100", autorizacion: "831000" });
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("credits an EXPIRADA payment once, even when verified again", async () => {
      const { card, referencia } = await started("verify-expired");
      await cancel({ referencia });
      fake.detail = detailOf("910002", "Aprobada", "25.00");

      const first = await verify(card, referencia);
      const before = await snapshot();
      const second = await verify(card, referencia);

      expect(first.status).toBe(200);
      expect(first.body.estadoPago).toBe("APROBADA");
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(fake.queries).toHaveLength(1);
      expect(await snapshot()).toEqual(before);
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("credits once when verified concurrently", async () => {
      const { card, referencia } = await started("verify-race");
      fake.detail = detailOf("910003", "Aprobada", "25.00");

      const answers = await Promise.all(Array.from({ length: 5 }, () => verify(card, referencia)));

      expect(answers.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
      expect(answers.map((res) => res.body.estadoPago)).toEqual(Array(5).fill("APROBADA"));
      expect(await rechargesOf(referencia)).toHaveLength(1);
      expect(await saldoOf(card)).toBe("28.00");
    });

    it("marks RECHAZADA a payment QPayPro reports Rechazada", async () => {
      const { card, referencia } = await started("verify-rejected");
      fake.detail = detailOf("910004", "Rechazada", "25.00", { authorizationNumber: null, responseCode: "05" });

      const res = await verify(card, referencia);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estadoPago: "RECHAZADA", numeroComprobante: null, saldo: 3 });
      expect(await paymentOf(referencia)).toMatchObject({ estado: "RECHAZADA", qpaypro: "910004", codigo: "05" });
      expect(await rechargesOf(referencia)).toEqual([]);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("leaves a fresh payment QPayPro reports Pendiente unchanged (L12)", async () => {
      const { card, referencia } = await started("verify-pending");
      fake.detail = detailOf("910008", "Pendiente", "25.00", { authorizationNumber: null, responseCode: null });
      const before = await snapshot();

      const res = await verify(card, referencia);

      expect(fake.queries).toHaveLength(1);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estadoPago: "INICIADA", numeroComprobante: null, saldo: 3 });
      expect(await snapshot()).toEqual(before);
    });

    it("leaves an unconfirmed INICIADA payment INICIADA, even when stale (no expiry here)", async () => {
      const { card, referencia } = await stale("verify-unknown");
      const before = await snapshot();

      const res = await verify(card, referencia);

      expect(fake.queries).toHaveLength(1);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estadoPago: "INICIADA", numeroComprobante: null, saldo: 3 });
      expect(await snapshot()).toEqual(before);
    });

    it("only answers the S6 body for a payment that is not INICIADA or EXPIRADA", async () => {
      const { card, referencia } = await started("verify-settled");
      await relay(relayParams(referencia, "25.00", "2"));
      fake.detail = detailOf("910005", "Aprobada", "25.00");
      const before = await snapshot();

      const res = await verify(card, referencia);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ referencia, numeroTarjeta: card, monto: 25, estadoPago: "RECHAZADA", numeroComprobante: null, saldo: 3 });
      expect(fake.queries).toEqual([]);
      expect(await snapshot()).toEqual(before);
    });

    it("answers 401 without a valid token and 403 without RECARGAS_REPORTES_CONSULTAR, changing nothing", async () => {
      const { card, referencia } = await started("verify-auth");
      fake.detail = detailOf("910006", "Aprobada", "25.00");
      const before = await snapshot();

      expect((await verify(card, referencia, null)).status).toBe(401);
      expect((await verify(card, referencia, "not-a-jwt")).status).toBe(401);
      expect((await verify(card, referencia, pilotToken)).status).toBe(403);

      expect(fake.queries).toEqual([]);
      expect(await snapshot()).toEqual(before);
    });

    it("answers 404 for an unknown card, an unknown referencia, another card's payment or a simulated one", async () => {
      const { card, referencia } = await started("verify-404");
      const otherCard = await createCard("verify-404-other", "1.00");
      const simulated = `${runTag}-verify-sim`;
      await dataSource.query(
        `INSERT INTO tbl_transaccion_pago (id_tarjeta_ciudadana, referencia_pago, monto_pago, estado_pago)
         SELECT id_tarjeta_ciudadana, $2, 25, 'INICIADA' FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1`,
        [card, simulated],
      );
      fake.detail = detailOf("910007", "Aprobada", "25.00");
      const before = await snapshot();

      const missingCard = await verify(`${runTag}-none`, referencia);
      expect(missingCard.status).toBe(404);
      expect(missingCard.body.message).toBe("La tarjeta no existe.");
      for (const [numero, ref] of [
        [card, "QPP-00000000-0000-4000-8000-000000000000"],
        [otherCard, referencia],
        [card, simulated],
      ] as const) {
        const res = await verify(numero, ref);
        expect(res.status).toBe(404);
        expect(res.body.message).toBe("El pago no existe.");
      }

      expect(fake.queries).toEqual([]);
      expect(await snapshot()).toEqual(before);
    });
  });
});
