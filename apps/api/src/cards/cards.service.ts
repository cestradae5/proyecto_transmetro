import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { CitizenCardNotFound } from "../citizen/citizen.errors.js";
import {
  ACTIVITY_LIMIT,
  CARDS_PAGE_SIZE,
  type CardActivityDto,
  type CardPageDto,
  type CardSummaryDto,
  type QueryCardsDto,
} from "./dto/cards.dto.js";

interface CardRow {
  idTarjeta: string;
  numeroTarjeta: string;
  saldo: string;
  estadoTarjeta: string;
}

interface PassRow {
  idEvento: string;
  tipo: string;
  montoCobrado: string;
  idParada: string;
  nombreParada: string;
  esEstacion: boolean;
  fecha: Date | string;
}

interface PaymentRow {
  idTransaccion: string;
  referencia: string;
  monto: string;
  estadoPago: string;
  idQpaypro: string | null;
  numeroComprobante: string | null;
  fecha: Date | string;
}

// Escapes LIKE wildcards so a search for "50%" matches the text "50%".
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

// Staff view of each card's turnstile passes and recharges
// (odd/tasks/card-activity.md). Read-only; raw SQL on the shared DataSource,
// like the citizen and operations services.
@Injectable()
export class CardsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // S3
  async list(query: QueryCardsDto): Promise<CardPageDto> {
    const page = query.page ?? 1;
    const pattern = query.search ? likePattern(query.search) : null;
    const where = pattern === null ? "" : "WHERE numero_tarjeta ILIKE $1";
    const params = pattern === null ? [] : [pattern];

    const total = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS "total" FROM tbl_tarjeta_ciudadana ${where}`,
      params,
    )) as { total: number }[];
    const rows = (await this.dataSource.query(
      `SELECT id_tarjeta_ciudadana AS "idTarjeta", numero_tarjeta AS "numeroTarjeta",
              saldo, estado_tarjeta AS "estadoTarjeta"
         FROM tbl_tarjeta_ciudadana ${where}
        ORDER BY numero_tarjeta ASC
        LIMIT ${CARDS_PAGE_SIZE} OFFSET ${(page - 1) * CARDS_PAGE_SIZE}`,
      params,
    )) as CardRow[];

    return {
      total: Number(total[0]?.total ?? 0),
      page,
      pageSize: CARDS_PAGE_SIZE,
      items: rows.map((row) => this.toSummary(row)),
    };
  }

  // S4
  async activity(numeroTarjeta: string): Promise<CardActivityDto> {
    const cards = (await this.dataSource.query(
      `SELECT id_tarjeta_ciudadana AS "idTarjeta", numero_tarjeta AS "numeroTarjeta",
              saldo, estado_tarjeta AS "estadoTarjeta"
         FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1`,
      [numeroTarjeta],
    )) as CardRow[];
    const card = cards[0];
    if (!card) throw new CitizenCardNotFound();

    const passes = (await this.dataSource.query(
      `SELECT ev.id_evento_talanquera AS "idEvento", ev.tipo_evento AS "tipo",
              ev.monto_cobrado AS "montoCobrado", p.id_parada AS "idParada",
              p.nombre_parada AS "nombreParada",
              EXISTS (SELECT 1 FROM tbl_estacion e WHERE e.id_parada = p.id_parada) AS "esEstacion",
              ev.fecha_evento AS "fecha"
         FROM tbl_evento_talanquera ev
        INNER JOIN tbl_parada p ON p.id_parada = ev.id_parada
        WHERE ev.id_tarjeta_ciudadana = $1
        ORDER BY ev.fecha_evento DESC, ev.id_evento_talanquera DESC
        LIMIT ${ACTIVITY_LIMIT}`,
      [card.idTarjeta],
    )) as PassRow[];

    const payments = (await this.dataSource.query(
      `SELECT t.id_transaccion_pago AS "idTransaccion", t.referencia_pago AS "referencia",
              t.monto_pago AS "monto", t.estado_pago AS "estadoPago",
              t.id_transaccion_qpaypro AS "idQpaypro", c.numero_comprobante AS "numeroComprobante",
              t.fecha_transaccion AS "fecha"
         FROM tbl_transaccion_pago t
         LEFT JOIN tbl_recarga r ON r.id_transaccion_pago = t.id_transaccion_pago
         LEFT JOIN tbl_comprobante c ON c.id_recarga = r.id_recarga
        WHERE t.id_tarjeta_ciudadana = $1
        ORDER BY t.fecha_transaccion DESC, t.id_transaccion_pago DESC
        LIMIT ${ACTIVITY_LIMIT}`,
      [card.idTarjeta],
    )) as PaymentRow[];

    return {
      tarjeta: this.toSummary(card),
      pasadas: passes.map((row) => ({
        idEvento: String(row.idEvento),
        tipo: row.tipo,
        montoCobrado: Number(row.montoCobrado),
        parada: {
          idParada: String(row.idParada),
          nombreParada: row.nombreParada,
          esEstacion: Boolean(row.esEstacion),
        },
        fecha: new Date(row.fecha).toISOString(),
      })),
      recargas: payments.map((row) => ({
        idTransaccion: String(row.idTransaccion),
        referencia: row.referencia,
        monto: Number(row.monto),
        estadoPago: row.estadoPago,
        origen: row.idQpaypro === null || row.idQpaypro === undefined ? "SIMULADA" : "QPAYPRO",
        numeroComprobante: row.numeroComprobante ?? null,
        fecha: new Date(row.fecha).toISOString(),
      })),
    };
  }

  private toSummary(row: CardRow): CardSummaryDto {
    return { numeroTarjeta: row.numeroTarjeta, saldo: Number(row.saldo), estadoTarjeta: row.estadoTarjeta };
  }
}
