import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import {
  CardNotActive,
  CardNotFound,
  InsufficientBalance,
  StationNotFound,
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
  StationOccupancyDto,
  TurnstilePassResponseDto,
  UnitOccupancyDto,
  UnitStopDto,
} from "./dto/ridership-response.dto.js";
import type { TurnstilePassDto, UnitArrivalDto } from "./dto/ridership-request.dto.js";

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

interface StationRow {
  idEstacion: string;
  nombreEstacion: string;
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

interface StopRow {
  idParadaUnidad: string;
  idEstacion: string;
  nombreEstacion: string;
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
  idEstacion: string | null;
  nombreEstacion: string | null;
}

const NUMERIC_ID = /^\d+$/;

const STOP_COLUMNS = `
       pu.id_parada_unidad AS "idParadaUnidad",
       e.id_estacion AS "idEstacion",
       e.nombre_estacion AS "nombreEstacion",
       pu.fecha_llegada AS "fechaLlegada",
       pu.fecha_salida AS "fechaSalida",
       pu.ocupacion_llegada AS "ocupacionLlegada",
       pu.subieron AS "subieron",
       pu.bajaron AS "bajaron",
       pu.ocupacion_resultante AS "ocupacionResultante",
       pu.minutos_espera_extra AS "minutosEsperaExtra"`;

// Passenger counting from turnstile events (odd/tasks/ridership-capacity.md).
// The turnstile sees people entering and leaving a STATION; who rides a bus
// is an estimate per stop. Raw SQL on the shared DataSource, like
// AlertaService.
//
// Locks keep the counts consistent under concurrent requests, always taken
// in the same order to avoid deadlocks: unit, then station, then card.
@Injectable()
export class RidershipService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // S4, S5, S1, S7: one turnstile pass.
  async registerPass(dto: TurnstilePassDto): Promise<TurnstilePassResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const station = await this.lockStation(manager, String(dto.idEstacion));
      const card = await this.lockCard(manager, dto.numeroTarjeta);

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
        `INSERT INTO tbl_evento_talanquera (id_estacion, id_tarjeta_ciudadana, tipo_evento, monto_cobrado)
         VALUES ($1, $2, $3, $4)
         RETURNING id_evento_talanquera AS "idEvento"`,
        [station.idEstacion, card.idTarjeta, dto.tipo, charged.toFixed(2)],
      )) as { idEvento: string }[];

      const people = await this.waitingAt(manager, station.idEstacion);
      let idAlerta: string | null = null;
      // The station row lock serializes passes at this station, so two
      // concurrent entries cannot both create the alert.
      if (
        dto.tipo === "ENTRADA" &&
        reachesStationAlert(people, station.capacidadPasajeros) &&
        !(await this.hasOpenAlert(manager, station.idEstacion))
      ) {
        const alert = (await manager.query(
          `INSERT INTO tbl_alerta (tipo_alerta, tipo_origen, tipo_destino, estado_alerta, id_estacion_origen)
           VALUES ($1, $2, $3, 'PENDIENTE', $4)
           RETURNING id_alerta AS "idAlerta"`,
          [CAPACITY_ALERT_TYPE, CAPACITY_ALERT_ORIGIN, CAPACITY_ALERT_DESTINATION, station.idEstacion],
        )) as { idAlerta: string }[];
        idAlerta = String(alert[0]!.idAlerta);
      }

      return {
        idEvento: String(inserted[0]!.idEvento),
        tipo: dto.tipo,
        numeroTarjeta: dto.numeroTarjeta,
        montoCobrado: charged,
        saldo,
        estacion: {
          ...this.toStationDto(station, people),
          alertaActiva: idAlerta !== null || (await this.hasOpenAlert(manager, station.idEstacion)),
        },
        alertaGenerada: idAlerta !== null,
        idAlerta,
      };
    });
  }

  // S8, S2: the bus stops at a station and boards the waiting.
  async arrive(idUnidad: string, dto: UnitArrivalDto): Promise<UnitStopDto> {
    const stopId = await this.dataSource.transaction(async (manager) => {
      const unit = await this.lockUnit(manager, idUnidad);
      const station = await this.lockStation(manager, String(dto.idEstacion));
      if (await this.findOpenStop(manager, unit.idUnidad)) {
        throw new UnitAlreadyAtStop(unit.idUnidad);
      }

      // A lowered unit capacity never leaves more aboard than it holds.
      const arrivedWith = Math.min(
        await this.lastOccupancy(manager, unit.idUnidad),
        unit.capacidadPasajeros,
      );
      const boarded = board(await this.waitingAt(manager, station.idEstacion), arrivedWith, unit.capacidadPasajeros);
      const occupancy = arrivedWith + boarded;

      const inserted = (await manager.query(
        `INSERT INTO tbl_parada_unidad
           (id_unidad, id_estacion, ocupacion_llegada, subieron, bajaron, ocupacion_resultante, minutos_espera_extra)
         VALUES ($1, $2, $3, $4, 0, $5, $6)
         RETURNING id_parada_unidad AS "id"`,
        [
          unit.idUnidad,
          station.idEstacion,
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
      await this.lockStation(manager, open.idEstacion);

      const exits = Number(
        firstRow(
          (await manager.query(
            `SELECT COUNT(*) AS "n" FROM tbl_evento_talanquera
              WHERE id_estacion = $1 AND tipo_evento = 'SALIDA' AND fecha_evento >= $2`,
            [open.idEstacion, open.fechaLlegada],
          )) as { n: string }[],
        ).n,
      );
      const gotOff = getOff(exits, Number(open.ocupacionLlegada));
      const afterExits = Math.min(Number(open.ocupacionResultante) - gotOff, unit.capacidadPasajeros);
      const boarded = board(await this.waitingAt(manager, open.idEstacion), afterExits, unit.capacidadPasajeros);

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

  // S9
  async getStation(idEstacion: string): Promise<StationOccupancyDto> {
    const station = await this.findStation(this.dataSource, idEstacion, false);
    const people = await this.waitingAt(this.dataSource, station.idEstacion);
    return {
      ...this.toStationDto(station, people),
      alertaActiva: await this.hasOpenAlert(this.dataSource, station.idEstacion),
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

  // S9: newest station capacity alerts.
  async listCapacityAlerts(): Promise<CapacityAlertDto[]> {
    const rows = (await this.dataSource.query(
      `SELECT a.id_alerta AS "idAlerta",
              a.estado_alerta AS "estadoAlerta",
              a.fecha_creacion AS "fechaCreacion",
              a.fecha_actualizacion AS "fechaActualizacion",
              e.id_estacion AS "idEstacion",
              e.nombre_estacion AS "nombreEstacion"
         FROM tbl_alerta a
         LEFT JOIN tbl_estacion e ON e.id_estacion = a.id_estacion_origen
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
      estacion: { idEstacion: String(row.idEstacion ?? ""), nombreEstacion: row.nombreEstacion ?? "" },
    }));
  }

  // S7: people who entered the station minus those who boarded a bus there.
  // Exits are passengers leaving buses, so they do not change the waiting.
  private async waitingAt(runner: Queryable, idEstacion: string): Promise<number> {
    const row = firstRow(
      (await runner.query(
        `SELECT GREATEST(0,
                  (SELECT COUNT(*) FROM tbl_evento_talanquera
                    WHERE id_estacion = $1 AND tipo_evento = 'ENTRADA')
                - (SELECT COALESCE(SUM(subieron), 0) FROM tbl_parada_unidad
                    WHERE id_estacion = $1))::int AS "people"`,
        [idEstacion],
      )) as { people: number }[],
    );
    return Number(row.people);
  }

  private async hasOpenAlert(runner: Queryable, idEstacion: string): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT 1 FROM tbl_alerta
        WHERE tipo_alerta = $1 AND id_estacion_origen = $2 AND estado_alerta <> 'RESUELTA'
        LIMIT 1`,
      [CAPACITY_ALERT_TYPE, idEstacion],
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
      `SELECT ${STOP_COLUMNS}
         FROM tbl_parada_unidad pu
        INNER JOIN tbl_estacion e ON e.id_estacion = pu.id_estacion
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
         FROM tbl_parada_unidad pu
        INNER JOIN tbl_estacion e ON e.id_estacion = pu.id_estacion
        INNER JOIN tbl_unidad u ON u.id_unidad = pu.id_unidad
        WHERE pu.id_parada_unidad = $1`,
      [idParadaUnidad],
    )) as (StopRow & UnitRow)[];
    const row = rows[0]!;
    return this.toStopDto(row, row);
  }

  private lockStation(runner: Queryable, idEstacion: string): Promise<StationRow> {
    return this.findStation(runner, idEstacion, true);
  }

  private async findStation(runner: Queryable, idEstacion: string, lock: boolean): Promise<StationRow> {
    if (!NUMERIC_ID.test(idEstacion)) throw new StationNotFound(idEstacion);
    const rows = (await runner.query(
      `SELECT id_estacion AS "idEstacion",
              nombre_estacion AS "nombreEstacion",
              capacidad_pasajeros AS "capacidadPasajeros"
         FROM tbl_estacion WHERE id_estacion = $1
         ${lock ? "FOR UPDATE" : ""}`,
      [idEstacion],
    )) as StationRow[];
    const row = rows[0];
    if (!row) throw new StationNotFound(idEstacion);
    return {
      idEstacion: String(row.idEstacion),
      nombreEstacion: row.nombreEstacion,
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

  private toStationDto(station: StationRow, people: number): Omit<StationOccupancyDto, "alertaActiva"> {
    return {
      idEstacion: station.idEstacion,
      nombreEstacion: station.nombreEstacion,
      capacidadPasajeros: station.capacidadPasajeros,
      personasEnEstacion: people,
      porcentaje: percentOf(people, station.capacidadPasajeros),
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
      idEstacion: String(stop.idEstacion),
      nombreEstacion: stop.nombreEstacion,
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

// TypeORM returns UPDATE ... RETURNING as [rows, affected] on Postgres and
// SELECT as rows; this reads the first row of either.
function firstRow<T>(result: [T[], number] | T[]): T {
  const rows = (Array.isArray(result[0]) ? result[0] : result) as T[];
  return rows[0]!;
}
