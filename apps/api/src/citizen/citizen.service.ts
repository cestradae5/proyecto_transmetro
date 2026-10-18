import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, QueryFailedError } from "typeorm";

import { CardCannotBeRecharged, CitizenCardNotFound, RechargeReferenceConflict } from "./citizen.errors.js";
import type {
  CitizenCardDto,
  CitizenLineDto,
  CreateRechargeDto,
  RechargeResponseDto,
} from "./dto/citizen.dto.js";

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface CardRow {
  idTarjeta: string;
  numeroTarjeta: string;
  saldo: string;
  estado: string;
}

interface LineStopRow {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
  idParada: string;
  nombreParada: string;
  orden: number;
  esEstacion: boolean;
}

interface LooseStopRow {
  idParada: string;
  nombreParada: string;
  esEstacion: boolean;
}

interface RechargeRow {
  idRecarga: string;
  idTarjeta: string;
  monto: string;
  fechaRecarga: Date | string;
  numeroComprobante: string;
}

export interface CreditedRecharge {
  idRecarga: string;
  fechaRecarga: Date | string;
  numeroComprobante: string;
  saldo: string;
}

const CARD_ACTIVE = "ACTIVA";
const ACTIVE = "ACTIVA";
const NO_LINE_NAME = "Sin línea";
const PAYMENT_APPROVED = "APROBADA";
const RECEIPT_PREFIX = "SIM-";
// Postgres' default name for UNIQUE (referencia_pago) in database/init.sql.
const REFERENCE_UNIQUE = "tbl_transaccion_pago_referencia_pago_key";

// Public endpoints for apps/user-web (odd/tasks/user-web.md). There is no
// citizen login: the card number identifies the card (S2). Raw SQL on the
// shared DataSource, like the operations services.
@Injectable()
export class CitizenService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // S3
  async getCard(numeroTarjeta: string): Promise<CitizenCardDto> {
    const card = await this.findCard(this.dataSource, numeroTarjeta, false);
    return { numeroTarjeta: card.numeroTarjeta, saldo: Number(card.saldo), estadoTarjeta: card.estado };
  }

  // parada-ridership S9: every ACTIVA parada, grouped by its ACTIVA lines in
  // route order (a parada on two lines appears in both), then a last
  // "Sin línea" group with the ACTIVA paradas on no ACTIVA line.
  async listLines(): Promise<CitizenLineDto[]> {
    const rows = (await this.dataSource.query(
      `SELECT l.id_linea AS "idLinea", l.numero_linea AS "numeroLinea", l.nombre_linea AS "nombreLinea",
              p.id_parada AS "idParada", p.nombre_parada AS "nombreParada", lp.orden AS "orden",
              EXISTS (SELECT 1 FROM tbl_estacion e WHERE e.id_parada = p.id_parada) AS "esEstacion"
         FROM tbl_linea l
        INNER JOIN tbl_linea_parada lp ON lp.id_linea = l.id_linea
        INNER JOIN tbl_parada p ON p.id_parada = lp.id_parada
        WHERE l.estado_linea = $1 AND p.estado_parada = $1
        ORDER BY l.id_linea, lp.orden`,
      [ACTIVE],
    )) as LineStopRow[];
    const loose = (await this.dataSource.query(
      `SELECT p.id_parada AS "idParada", p.nombre_parada AS "nombreParada",
              EXISTS (SELECT 1 FROM tbl_estacion e WHERE e.id_parada = p.id_parada) AS "esEstacion"
         FROM tbl_parada p
        WHERE p.estado_parada = $1
          AND NOT EXISTS (
            SELECT 1 FROM tbl_linea_parada lp
             INNER JOIN tbl_linea l ON l.id_linea = lp.id_linea
             WHERE lp.id_parada = p.id_parada AND l.estado_linea = $1)
        ORDER BY p.nombre_parada ASC, p.id_parada ASC`,
      [ACTIVE],
    )) as LooseStopRow[];

    const lines = new Map<string, CitizenLineDto>();
    for (const row of rows) {
      const key = String(row.idLinea);
      let line = lines.get(key);
      if (!line) {
        line = { idLinea: key, numeroLinea: row.numeroLinea, nombreLinea: row.nombreLinea, paradas: [] };
        lines.set(key, line);
      }
      line.paradas.push({
        idParada: String(row.idParada),
        nombreParada: row.nombreParada,
        orden: Number(row.orden),
        esEstacion: Boolean(row.esEstacion),
      });
    }
    const sorted = [...lines.values()].sort((a, b) =>
      String(a.numeroLinea).localeCompare(String(b.numeroLinea), "es", { numeric: true, sensitivity: "base" }),
    );
    if (loose.length > 0) {
      sorted.push({
        idLinea: null,
        numeroLinea: null,
        nombreLinea: NO_LINE_NAME,
        paradas: loose.map((row) => ({
          idParada: String(row.idParada),
          nombreParada: row.nombreParada,
          orden: null,
          esEstacion: Boolean(row.esEstacion),
        })),
      });
    }
    return sorted;
  }

  // S5, S6: a simulated, always-approved payment. The same referencia for
  // the same card and amount returns the original recharge.
  async recharge(numeroTarjeta: string, dto: CreateRechargeDto): Promise<RechargeResponseDto> {
    try {
      return await this.rechargeOnce(numeroTarjeta, dto);
    } catch (error) {
      // Two cards racing with the same referencia: UNIQUE referencia_pago.
      // Any other UNIQUE is a different failure and is rethrown as is.
      const driver = error instanceof QueryFailedError ? (error.driverError as { code?: string; constraint?: string }) : undefined;
      if (driver?.code === "23505" && driver.constraint === REFERENCE_UNIQUE) {
        throw new RechargeReferenceConflict();
      }
      throw error;
    }
  }

  private async rechargeOnce(numeroTarjeta: string, dto: CreateRechargeDto): Promise<RechargeResponseDto> {
    const monto = dto.monto.toFixed(2);
    return this.dataSource.transaction(async (manager) => {
      const card = await this.findCard(manager, numeroTarjeta, true);

      const previous = (await manager.query(
        `SELECT r.id_recarga AS "idRecarga", r.id_tarjeta_ciudadana AS "idTarjeta",
                r.monto_recarga AS "monto", r.fecha_recarga AS "fechaRecarga",
                c.numero_comprobante AS "numeroComprobante"
           FROM tbl_transaccion_pago t
           LEFT JOIN tbl_recarga r ON r.id_transaccion_pago = t.id_transaccion_pago
           LEFT JOIN tbl_comprobante c ON c.id_recarga = r.id_recarga
          WHERE t.referencia_pago = $1`,
        [dto.referencia],
      )) as RechargeRow[];
      const original = previous[0];
      if (original) {
        if (String(original.idTarjeta) !== card.idTarjeta || Number(original.monto).toFixed(2) !== monto) {
          throw new RechargeReferenceConflict();
        }
        return this.toDto(original, Number(card.saldo), true);
      }

      if (card.estado !== CARD_ACTIVE) throw new CardCannotBeRecharged(card.estado);

      const tx = (await manager.query(
        `INSERT INTO tbl_transaccion_pago
           (id_tarjeta_ciudadana, referencia_pago, monto_pago, moneda, estado_pago, fecha_confirmacion)
         VALUES ($1, $2, $3, 'GTQ', $4, CURRENT_TIMESTAMP)
         RETURNING id_transaccion_pago AS "id"`,
        [card.idTarjeta, dto.referencia, monto, PAYMENT_APPROVED],
      )) as { id: string }[];
      const credited = await this.creditRecharge(manager, tx[0]!.id, card.idTarjeta, monto, RECEIPT_PREFIX);

      return this.toDto({ ...credited, idTarjeta: card.idTarjeta, monto }, Number(credited.saldo), false);
    });
  }

  // The recharge of an approved payment: one tbl_recarga, its tbl_comprobante
  // `<receiptPrefix><idRecarga>` and the amount added to the balance. Runs
  // inside the caller's transaction (simulated recharge, qpaypro-checkout S4).
  async creditRecharge(
    manager: Queryable,
    idTransaccion: string,
    idTarjeta: string,
    monto: string,
    receiptPrefix: string,
  ): Promise<CreditedRecharge> {
    const recarga = (await manager.query(
      `INSERT INTO tbl_recarga (id_transaccion_pago, id_tarjeta_ciudadana, monto_recarga)
       VALUES ($1, $2, $3)
       RETURNING id_recarga AS "idRecarga", fecha_recarga AS "fechaRecarga"`,
      [idTransaccion, idTarjeta, monto],
    )) as { idRecarga: string; fechaRecarga: Date | string }[];
    const idRecarga = String(recarga[0]!.idRecarga);
    const numeroComprobante = `${receiptPrefix}${idRecarga}`;
    await manager.query(
      `INSERT INTO tbl_comprobante (id_recarga, numero_comprobante) VALUES ($1, $2)`,
      [idRecarga, numeroComprobante],
    );
    const updated = (await manager.query(
      `UPDATE tbl_tarjeta_ciudadana SET saldo = saldo + $1
        WHERE id_tarjeta_ciudadana = $2
        RETURNING saldo`,
      [monto, idTarjeta],
    )) as [{ saldo: string }[], number] | { saldo: string }[];
    return { idRecarga, fechaRecarga: recarga[0]!.fechaRecarga, numeroComprobante, saldo: firstRow(updated).saldo };
  }

  async findCard(runner: Queryable, numeroTarjeta: string, lock: boolean): Promise<CardRow> {
    const rows = (await runner.query(
      `SELECT id_tarjeta_ciudadana AS "idTarjeta", numero_tarjeta AS "numeroTarjeta",
              saldo, estado_tarjeta AS "estado"
         FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1
         ${lock ? "FOR UPDATE" : ""}`,
      [numeroTarjeta],
    )) as CardRow[];
    const row = rows[0];
    if (!row) throw new CitizenCardNotFound();
    return { ...row, idTarjeta: String(row.idTarjeta) };
  }

  private toDto(row: RechargeRow, saldo: number, repetida: boolean): RechargeResponseDto {
    return {
      idRecarga: String(row.idRecarga),
      numeroComprobante: row.numeroComprobante,
      monto: Number(row.monto),
      saldo,
      fechaRecarga: new Date(row.fechaRecarga).toISOString(),
      repetida,
    };
  }
}

// TypeORM returns UPDATE ... RETURNING as [rows, affected] on Postgres.
function firstRow<T>(result: [T[], number] | T[]): T {
  const rows = (Array.isArray(result[0]) ? result[0] : result) as T[];
  return rows[0]!;
}
