import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, QueryFailedError } from "typeorm";

import { CardCannotBeRecharged, CitizenCardNotFound, RechargeReferenceConflict } from "./citizen.errors.js";
import type {
  CitizenCardDto,
  CitizenStationDto,
  CreateRechargeDto,
  RechargeResponseDto,
} from "./dto/citizen.dto.js";

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

interface CardRow {
  idTarjeta: string;
  numeroTarjeta: string;
  saldo: string;
  estado: string;
}

interface RechargeRow {
  idRecarga: string;
  idTarjeta: string;
  monto: string;
  fechaRecarga: Date | string;
  numeroComprobante: string;
}

const CARD_ACTIVE = "ACTIVA";
const STATION_ACTIVE = "ACTIVA";
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

  // S4
  async listStations(): Promise<CitizenStationDto[]> {
    const rows = (await this.dataSource.query(
      `SELECT id_estacion AS "idEstacion", nombre_estacion AS "nombreEstacion"
         FROM tbl_estacion WHERE estado_estacion = $1
        ORDER BY nombre_estacion ASC, id_estacion ASC`,
      [STATION_ACTIVE],
    )) as CitizenStationDto[];
    return rows.map((row) => ({ idEstacion: String(row.idEstacion), nombreEstacion: row.nombreEstacion }));
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
      const recarga = (await manager.query(
        `INSERT INTO tbl_recarga (id_transaccion_pago, id_tarjeta_ciudadana, monto_recarga)
         VALUES ($1, $2, $3)
         RETURNING id_recarga AS "idRecarga", fecha_recarga AS "fechaRecarga"`,
        [tx[0]!.id, card.idTarjeta, monto],
      )) as { idRecarga: string; fechaRecarga: Date | string }[];
      const idRecarga = String(recarga[0]!.idRecarga);
      const numeroComprobante = `${RECEIPT_PREFIX}${idRecarga}`;
      await manager.query(
        `INSERT INTO tbl_comprobante (id_recarga, numero_comprobante) VALUES ($1, $2)`,
        [idRecarga, numeroComprobante],
      );
      const updated = (await manager.query(
        `UPDATE tbl_tarjeta_ciudadana SET saldo = saldo + $1
          WHERE id_tarjeta_ciudadana = $2
          RETURNING saldo`,
        [monto, card.idTarjeta],
      )) as [{ saldo: string }[], number] | { saldo: string }[];

      return this.toDto(
        { idRecarga, idTarjeta: card.idTarjeta, monto, fechaRecarga: recarga[0]!.fechaRecarga, numeroComprobante },
        Number(firstRow(updated).saldo),
        false,
      );
    });
  }

  private async findCard(runner: Queryable, numeroTarjeta: string, lock: boolean): Promise<CardRow> {
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
