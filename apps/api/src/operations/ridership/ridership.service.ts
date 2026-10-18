import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, QueryFailedError } from "typeorm";

import {
  CardNotActive,
  CardNotFound,
  IdempotencyKeyConflict,
  InsufficientBalance,
  ParadaNotFound,
  UnitAlreadyAtStop,
  UnitNotAtStop,
  UnitNotFound,
} from "../shared/operations.errors.js";
import {
  CAPACITY_ALERTS_LIMIT,
  CAPACITY_ALERT_DESTINATION,
  CAPACITY_ALERT_ORIGIN,
  CAPACITY_ALERT_TYPE,
  CARD_ACTIVE,
  FARE,
} from "./ridership.constants.js";
import { board, extraWaitMinutes, getOff, percentOf, reachesStationAlert } from "./ridership.rules.js";
import type {
  CapacityAlertDto,
  ParadaOccupancyDto,
  TurnstilePassResponseDto,
  UnitOccupancyDto,
  UnitStopDto,
} from "./dto/ridership-response.dto.js";
import type { TurnstilePassDto, UnitArrivalDto } from "./dto/ridership-request.dto.js";

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

// A parada and, when it is also a station, its tbl_estacion id.
interface ParadaRow {
  idParada: string;
  nombreParada: string;
  idEstacion: string | null;
  capacidadPasajeros: number;
}

interface UnitRow {
  idUnidad: string;
  numeroPlaca: string;
  capacidadPasajeros: number;
}

interface CardRow {
  idTarjeta: string;
  saldo: string;
  estado: string;
}

interface KeyedEventRow {
  idEvento: string;
  idParada: string;
  idTarjeta: string;
  tipo: string;
  montoCobrado: string;
}

interface StopRow {
  idParadaUnidad: string;
  idParada: string;
  nombreParada: string;
  idEstacion: string | null;
  fechaLlegada: Date | string;
  fechaSalida: Date | string | null;
  ocupacionLlegada: number;
  subieron: number;
  bajaron: number;
  ocupacionResultante: number;
  minutosEsperaExtra: number;
}

interface CapacityAlertRow {
  idAlerta: string;
  estadoAlerta: string;
  fechaCreacion: Date | string;
  fechaActualizacion: Date | string;
  idParada: string | null;
  nombreParada: string | null;
  idEstacion: string | null;
}

const NUMERIC_ID = /^\d+$/;

// Postgres' default name for UNIQUE (clave_idempotencia) in database/init.sql.
const IDEMPOTENCY_UNIQUE = "tbl_evento_talanquera_clave_idempotencia_key";

const STOP_COLUMNS = `
       pu.id_parada_unidad AS "idParadaUnidad",
       p.id_parada AS "idParada",
       p.nombre_parada AS "nombreParada",
       e.id_estacion AS "idEstacion",
       pu.fecha_llegada AS "fechaLlegada",
       pu.fecha_salida AS "fechaSalida",
       pu.ocupacion_llegada AS "ocupacionLlegada",
       pu.subieron AS "subieron",
       pu.bajaron AS "bajaron",
       pu.ocupacion_resultante AS "ocupacionResultante",
       pu.minutos_espera_extra AS "minutosEsperaExtra"`;

const STOP_FROM = `
         FROM tbl_parada_unidad pu
        INNER JOIN tbl_parada p ON p.id_parada = pu.id_parada
         LEFT JOIN tbl_estacion e ON e.id_parada = p.id_parada`;

// Passenger counting from turnstile events (odd/tasks/ridership-capacity.md,
// odd/tasks/parada-ridership.md). The turnstile sees people entering and
// leaving a PARADA (a station is a parada with a tbl_estacion row and uses
// its parada's count and capacity); who rides a bus is an estimate per stop.
// Raw SQL on the shared DataSource, like AlertaService.
//
// Locks keep the counts consistent under concurrent requests, always taken
// in the same order to avoid deadlocks: unit, then parada, then card.
@Injectable()
export class RidershipService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // S4, S5, S1, S7: one turnstile pass. With an idempotencyKey a retry
  // returns the original pass (user-web S7).
  async registerPass(dto: TurnstilePassDto): Promise<TurnstilePassResponseDto> {
    try {
      return await this.registerPassOnce(dto);
    } catch (error) {
      // Two different cards racing with the same key: the UNIQUE column
      // rejects the second insert. Any other UNIQUE is rethrown as is.
      const driver = error instanceof QueryFailedError ? (error.driverError as { code?: string; constraint?: string }) : undefined;
      if (driver?.code === "23505" && driver.constraint === IDEMPOTENCY_UNIQUE) {
        throw new IdempotencyKeyConflict();
      }
      throw error;
    }
  }

  private async registerPassOnce(dto: TurnstilePassDto): Promise<TurnstilePassResponseDto> {
    const key = dto.idempotencyKey ?? null;
    return this.dataSource.transaction(async (manager) => {
      const parada = await this.lockParada(manager, String(dto.idParada));
      const card = await this.lockCard(manager, dto.numeroTarjeta);

      if (key !== null) {
        const previous = (await manager.query(
          `SELECT id_evento_talanquera AS "idEvento", id_parada AS "idParada",
                  id_tarjeta_ciudadana AS "idTarjeta", tipo_evento AS "tipo",
                  monto_cobrado AS "montoCobrado"
             FROM tbl_evento_talanquera WHERE clave_idempotencia = $1`,
          [key],
        )) as KeyedEventRow[];
        const original = previous[0];
        if (original) {
          if (
            String(original.idTarjeta) !== card.idTarjeta ||
            String(original.idParada) !== parada.idParada ||
            original.tipo !== dto.tipo
          ) {
            throw new IdempotencyKeyConflict();
          }
          const people = await this.waitingAt(manager, parada.idParada);
          return {
            idEvento: String(original.idEvento),
            tipo: dto.tipo,
            numeroTarjeta: dto.numeroTarjeta,
            montoCobrado: Number(original.montoCobrado),
            saldo: Number(card.saldo),
            parada: {
              ...this.toParadaDto(parada, people),
              alertaActiva: await this.hasOpenAlert(manager, parada.idParada),
            },
            alertaGenerada: false,
            idAlerta: null,
            repetido: true,
          };
        }
      }

      let charged = 0;
      let saldo = Number(card.saldo);
      if (dto.tipo === "ENTRADA") {
        if (card.estado !== CARD_ACTIVE) throw new CardNotActive(card.estado);
        if (saldo < FARE) throw new InsufficientBalance(saldo, FARE);
        const updated = (await manager.query(
          `UPDATE tbl_tarjeta_ciudadana SET saldo = saldo - $1
            WHERE id_tarjeta_ciudadana = $2
            RETURNING saldo`,
          [FARE.toFixed(2), card.idTarjeta],
        )) as [{ saldo: string }[], number] | { saldo: string }[];
        saldo = Number(firstRow(updated).saldo);
        charged = FARE;
      }

      const inserted = (await manager.query(
        `INSERT INTO tbl_evento_talanquera (id_parada, id_tarjeta_ciudadana, tipo_evento, monto_cobrado, clave_idempotencia)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id_evento_talanquera AS "idEvento"`,
        [parada.idParada, card.idTarjeta, dto.tipo, charged.toFixed(2), key],
      )) as { idEvento: string }[];

      const people = await this.waitingAt(manager, parada.idParada);
      let idAlerta: string | null = null;
      // The parada row lock serializes passes at this parada, so two
      // concurrent entries cannot both create the alert.
      if (
        dto.tipo === "ENTRADA" &&
        reachesStationAlert(people, parada.capacidadPasajeros) &&
        !(await this.hasOpenAlert(manager, parada.idParada))
      ) {
        const alert = (await manager.query(
          `INSERT INTO tbl_alerta
             (tipo_alerta, tipo_origen, tipo_destino, estado_alerta, id_parada_origen, id_estacion_origen)
           VALUES ($1, $2, $3, 'PENDIENTE', $4, $5)
           RETURNING id_alerta AS "idAlerta"`,
          [CAPACITY_ALERT_TYPE, CAPACITY_ALERT_ORIGIN, CAPACITY_ALERT_DESTINATION, parada.idParada, parada.idEstacion],
        )) as { idAlerta: string }[];
        idAlerta = String(alert[0]!.idAlerta);
      }

      return {
        idEvento: String(inserted[0]!.idEvento),
        tipo: dto.tipo,
        numeroTarjeta: dto.numeroTarjeta,
        montoCobrado: charged,
        saldo,
        parada: {
          ...this.toParadaDto(parada, people),
          alertaActiva: idAlerta !== null || (await this.hasOpenAlert(manager, parada.idParada)),
        },
        alertaGenerada: idAlerta !== null,
        idAlerta,
        repetido: false,
      };
    });
  }

  // S8, S2: the bus stops at a parada and boards the waiting.
  async arrive(idUnidad: string, dto: UnitArrivalDto): Promise<UnitStopDto> {
    const stopId = await this.dataSource.transaction(async (manager) => {
      const unit = await this.lockUnit(manager, idUnidad);
      const parada = await this.lockParada(manager, String(dto.idParada));
      if (await this.findOpenStop(manager, unit.idUnidad)) {
        throw new UnitAlreadyAtStop(unit.idUnidad);
      }

      // A lowered unit capacity never leaves more aboard than it holds.
      const arrivedWith = Math.min(
        await this.lastOccupancy(manager, unit.idUnidad),
        unit.capacidadPasajeros,
      );
      const boarded = board(await this.waitingAt(manager, parada.idParada), arrivedWith, unit.capacidadPasajeros);
      const occupancy = arrivedWith + boarded;

      const inserted = (await manager.query(
        `INSERT INTO tbl_parada_unidad
           (id_unidad, id_parada, ocupacion_llegada, subieron, bajaron, ocupacion_resultante, minutos_espera_extra)
         VALUES ($1, $2, $3, $4, 0, $5, $6)
         RETURNING id_parada_unidad AS "id"`,
        [
          unit.idUnidad,
          parada.idParada,
          arrivedWith,
          boarded,
          occupancy,
          extraWaitMinutes(occupancy, unit.capacidadPasajeros),
        ],
      )) as { id: string }[];
      return String(inserted[0]!.id);
    });
    return this.findStop(stopId);
  }

  // S8: the bus leaves. Exits during the stop get off, then the passengers
  // who arrived meanwhile board.
  async depart(idUnidad: string): Promise<UnitStopDto> {
    const stopId = await this.dataSource.transaction(async (manager) => {
      const unit = await this.lockUnit(manager, idUnidad);
      const open = await this.findOpenStop(manager, unit.idUnidad);
      if (!open) throw new UnitNotAtStop(unit.idUnidad);
      await this.lockParada(manager, open.idParada);

      const exits = Number(
        firstRow(
          (await manager.query(
            `SELECT COUNT(*) AS "n" FROM tbl_evento_talanquera
              WHERE id_parada = $1 AND tipo_evento = 'SALIDA' AND fecha_evento >= $2`,
            [open.idParada, open.fechaLlegada],
          )) as { n: string }[],
        ).n,
      );
      const gotOff = getOff(exits, Number(open.ocupacionLlegada));
      const afterExits = Math.min(Number(open.ocupacionResultante) - gotOff, unit.capacidadPasajeros);
      const boarded = board(await this.waitingAt(manager, open.idParada), afterExits, unit.capacidadPasajeros);

      await manager.query(
        `UPDATE tbl_parada_unidad
            SET fecha_salida = CURRENT_TIMESTAMP,
                bajaron = $1,
                subieron = subieron + $2,
                ocupacion_resultante = $3
          WHERE id_parada_unidad = $4`,
        [gotOff, boarded, afterExits + boarded, open.idParadaUnidad],
      );
      return String(open.idParadaUnidad);
    });
    return this.findStop(stopId);
  }

  // S9 (parada-ridership S8)
  async getParada(idParada: string): Promise<ParadaOccupancyDto> {
    const parada = await this.findParada(this.dataSource, idParada, false);
    const people = await this.waitingAt(this.dataSource, parada.idParada);
    return {
      ...this.toParadaDto(parada, people),
      alertaActiva: await this.hasOpenAlert(this.dataSource, parada.idParada),
    };
  }

  // S9: occupancy carried by the open stop, else by the last closed one.
  async getUnit(idUnidad: string): Promise<UnitOccupancyDto> {
    const unit = await this.findUnit(this.dataSource, idUnidad, false);
    const open = await this.findOpenStop(this.dataSource, unit.idUnidad);
    const occupancy = open
      ? Number(open.ocupacionResultante)
      : Math.min(await this.lastOccupancy(this.dataSource, unit.idUnidad), unit.capacidadPasajeros);
    return {
      idUnidad: unit.idUnidad,
      numeroPlaca: unit.numeroPlaca,
      capacidadPasajeros: unit.capacidadPasajeros,
      ocupacionEstimada: occupancy,
      porcentaje: percentOf(occupancy, unit.capacidadPasajeros),
      paradaAbierta: open ? this.toStopDto(unit, open) : null,
    };
  }

  // S9: newest capacity alerts, with their parada (and station, if any).
  async listCapacityAlerts(): Promise<CapacityAlertDto[]> {
    const rows = (await this.dataSource.query(
      `SELECT a.id_alerta AS "idAlerta",
              a.estado_alerta AS "estadoAlerta",
              a.fecha_creacion AS "fechaCreacion",
              a.fecha_actualizacion AS "fechaActualizacion",
              p.id_parada AS "idParada",
              p.nombre_parada AS "nombreParada",
              a.id_estacion_origen AS "idEstacion"
         FROM tbl_alerta a
         LEFT JOIN tbl_parada p ON p.id_parada = a.id_parada_origen
        WHERE a.tipo_alerta = $1
        ORDER BY a.fecha_creacion DESC, a.id_alerta DESC
        LIMIT ${CAPACITY_ALERTS_LIMIT}`,
      [CAPACITY_ALERT_TYPE],
    )) as CapacityAlertRow[];
    return rows.map((row) => ({
      idAlerta: String(row.idAlerta),
      estadoAlerta: row.estadoAlerta,
      fechaCreacion: new Date(row.fechaCreacion).toISOString(),
      fechaActualizacion: new Date(row.fechaActualizacion).toISOString(),
      parada: {
        idParada: String(row.idParada ?? ""),
        nombreParada: row.nombreParada ?? "",
        idEstacion: nullableId(row.idEstacion),
      },
    }));
  }

  // S7: people who entered the parada minus those who boarded a bus there.
  // Exits are passengers leaving buses, so they do not change the waiting.
  private async waitingAt(runner: Queryable, idParada: string): Promise<number> {
    const row = firstRow(
      (await runner.query(
        `SELECT GREATEST(0,
                  (SELECT COUNT(*) FROM tbl_evento_talanquera
                    WHERE id_parada = $1 AND tipo_evento = 'ENTRADA')
                - (SELECT COALESCE(SUM(subieron), 0) FROM tbl_parada_unidad
                    WHERE id_parada = $1))::int AS "people"`,
        [idParada],
      )) as { people: number }[],
    );
    return Number(row.people);
  }

  private async hasOpenAlert(runner: Queryable, idParada: string): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT 1 FROM tbl_alerta
        WHERE tipo_alerta = $1 AND id_parada_origen = $2 AND estado_alerta <> 'RESUELTA'
        LIMIT 1`,
      [CAPACITY_ALERT_TYPE, idParada],
    )) as unknown[];
    return rows.length > 0;
  }

  private async lastOccupancy(runner: Queryable, idUnidad: string): Promise<number> {
    const rows = (await runner.query(
      `SELECT ocupacion_resultante AS "ocupacion" FROM tbl_parada_unidad
        WHERE id_unidad = $1 AND fecha_salida IS NOT NULL
        ORDER BY fecha_salida DESC, id_parada_unidad DESC
        LIMIT 1`,
      [idUnidad],
    )) as { ocupacion: number }[];
    return rows[0] ? Number(rows[0].ocupacion) : 0;
  }

  private async findOpenStop(runner: Queryable, idUnidad: string): Promise<StopRow | null> {
    const rows = (await runner.query(
      `SELECT ${STOP_COLUMNS} ${STOP_FROM}
        WHERE pu.id_unidad = $1 AND pu.fecha_salida IS NULL`,
      [idUnidad],
    )) as StopRow[];
    return rows[0] ?? null;
  }

  private async findStop(idParadaUnidad: string): Promise<UnitStopDto> {
    const rows = (await this.dataSource.query(
      `SELECT ${STOP_COLUMNS},
              u.id_unidad AS "idUnidad",
              u.numero_placa AS "numeroPlaca",
              u.capacidad_pasajeros AS "capacidadPasajeros"
        ${STOP_FROM}
        INNER JOIN tbl_unidad u ON u.id_unidad = pu.id_unidad
        WHERE pu.id_parada_unidad = $1`,
      [idParadaUnidad],
    )) as (StopRow & UnitRow)[];
    const row = rows[0]!;
    return this.toStopDto(row, row);
  }

  private lockParada(runner: Queryable, idParada: string): Promise<ParadaRow> {
    return this.findParada(runner, idParada, true);
  }

  // FOR UPDATE OF p: Postgres cannot lock the nullable side of the outer join
  // (the station), and the parada row is what serializes the counts.
  private async findParada(runner: Queryable, idParada: string, lock: boolean): Promise<ParadaRow> {
    if (!NUMERIC_ID.test(idParada)) throw new ParadaNotFound(idParada);
    const rows = (await runner.query(
      `SELECT p.id_parada AS "idParada",
              p.nombre_parada AS "nombreParada",
              p.capacidad_pasajeros AS "capacidadPasajeros",
              e.id_estacion AS "idEstacion"
         FROM tbl_parada p
         LEFT JOIN tbl_estacion e ON e.id_parada = p.id_parada
        WHERE p.id_parada = $1
         ${lock ? "FOR UPDATE OF p" : ""}`,
      [idParada],
    )) as ParadaRow[];
    const row = rows[0];
    if (!row) throw new ParadaNotFound(idParada);
    return {
      idParada: String(row.idParada),
      nombreParada: row.nombreParada,
      idEstacion: nullableId(row.idEstacion),
      capacidadPasajeros: Number(row.capacidadPasajeros),
    };
  }

  private lockUnit(runner: Queryable, idUnidad: string): Promise<UnitRow> {
    return this.findUnit(runner, idUnidad, true);
  }

  private async findUnit(runner: Queryable, idUnidad: string, lock: boolean): Promise<UnitRow> {
    if (!NUMERIC_ID.test(idUnidad)) throw new UnitNotFound(idUnidad);
    const rows = (await runner.query(
      `SELECT id_unidad AS "idUnidad",
              numero_placa AS "numeroPlaca",
              capacidad_pasajeros AS "capacidadPasajeros"
         FROM tbl_unidad WHERE id_unidad = $1
         ${lock ? "FOR UPDATE" : ""}`,
      [idUnidad],
    )) as UnitRow[];
    const row = rows[0];
    if (!row) throw new UnitNotFound(idUnidad);
    return {
      idUnidad: String(row.idUnidad),
      numeroPlaca: row.numeroPlaca,
      capacidadPasajeros: Number(row.capacidadPasajeros),
    };
  }

  private async lockCard(runner: Queryable, numeroTarjeta: string): Promise<CardRow> {
    const rows = (await runner.query(
      `SELECT id_tarjeta_ciudadana AS "idTarjeta", saldo, estado_tarjeta AS "estado"
         FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1
         FOR UPDATE`,
      [numeroTarjeta],
    )) as CardRow[];
    const row = rows[0];
    if (!row) throw new CardNotFound();
    return { ...row, idTarjeta: String(row.idTarjeta) };
  }

  private toParadaDto(parada: ParadaRow, people: number): Omit<ParadaOccupancyDto, "alertaActiva"> {
    return {
      idParada: parada.idParada,
      nombreParada: parada.nombreParada,
      idEstacion: parada.idEstacion,
      capacidadPasajeros: parada.capacidadPasajeros,
      personasEnParada: people,
      porcentaje: percentOf(people, parada.capacidadPasajeros),
    };
  }

  private toStopDto(unit: UnitRow, stop: StopRow): UnitStopDto {
    const capacity = Number(unit.capacidadPasajeros);
    const occupancy = Number(stop.ocupacionResultante);
    return {
      idParadaUnidad: String(stop.idParadaUnidad),
      idUnidad: String(unit.idUnidad),
      numeroPlaca: unit.numeroPlaca,
      capacidadPasajeros: capacity,
      idParada: String(stop.idParada),
      nombreParada: stop.nombreParada,
      idEstacion: nullableId(stop.idEstacion),
      ocupacionLlegada: Number(stop.ocupacionLlegada),
      subieron: Number(stop.subieron),
      bajaron: Number(stop.bajaron),
      ocupacionEstimada: occupancy,
      porcentaje: percentOf(occupancy, capacity),
      minutosEsperaExtra: Number(stop.minutosEsperaExtra),
      fechaLlegada: new Date(stop.fechaLlegada).toISOString(),
      fechaSalida: stop.fechaSalida === null ? null : new Date(stop.fechaSalida).toISOString(),
    };
  }
}

function nullableId(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

// TypeORM returns UPDATE ... RETURNING as [rows, affected] on Postgres and
// SELECT as rows; this reads the first row of either.
function firstRow<T>(result: [T[], number] | T[]): T {
  const rows = (Array.isArray(result[0]) ? result[0] : result) as T[];
  return rows[0]!;
}
