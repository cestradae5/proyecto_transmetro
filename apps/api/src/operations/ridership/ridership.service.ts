import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, QueryFailedError } from "typeorm";

import { PilotHasNoUnitAssigned } from "../../fleet/shared/fleet.errors.js";
import {
  CardNotActive,
  CardNotFound,
  IdempotencyKeyConflict,
  InsufficientBalance,
  NoCurrentStop,
  OverCapacity,
  ParadaNotFound,
  TooManyGettingOff,
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
import { extraWaitMinutes, percentOf, reachesStationAlert } from "./ridership.rules.js";
import type {
  CapacityAlertDto,
  ParadaOccupancyDto,
  StopReportDto,
  TurnstilePassResponseDto,
  UnitOccupancyDto,
} from "./dto/ridership-response.dto.js";
import type { StopReportRequestDto, TurnstilePassDto } from "./dto/ridership-request.dto.js";

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

// A parada, its current count and, when it is also a station, its
// tbl_estacion id.
interface ParadaRow {
  idParada: string;
  nombreParada: string;
  idEstacion: string | null;
  capacidadPasajeros: number;
  personasEnParada: number;
}

interface UnitRow {
  idUnidad: string;
  numeroPlaca: string;
  capacidadPasajeros: number;
}

// The pilot's unit and the parada of its current reported stop, if any.
interface PilotUnitRow extends UnitRow {
  idParadaActual: string | null;
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

interface ReportRow {
  idParadaUnidad: string;
  idParada: string;
  nombreParada: string;
  bajaron: number;
  subieron: number;
  ocupacionResultante: number;
  minutosEsperaExtra: number;
  fechaReporte: Date | string;
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

const REPORT_SELECT = `
       SELECT pu.id_parada_unidad AS "idParadaUnidad",
              p.id_parada AS "idParada",
              p.nombre_parada AS "nombreParada",
              pu.bajaron AS "bajaron",
              pu.subieron AS "subieron",
              pu.ocupacion_resultante AS "ocupacionResultante",
              pu.minutos_espera_extra AS "minutosEsperaExtra",
              pu.fecha_reporte AS "fechaReporte"
         FROM tbl_parada_unidad pu
        INNER JOIN tbl_parada p ON p.id_parada = pu.id_parada`;

// Passenger counting (odd/tasks/ridership-capacity.md, parada-ridership.md,
// bus-passenger-report.md). Two separate features:
// - The turnstile is the only way into or out of a PARADA: ENTRADA adds one
//   person and charges the fare, SALIDA removes one. A station is a parada
//   with a tbl_estacion row and uses its parada's count and capacity.
// - The bus only moves people between paradas: at its current stop the
//   pilot reports how many got off (bus -> parada) and on (parada -> bus).
// The parada keeps its current count (tbl_parada.personas_en_parada), floored
// at 0, changed in the same transaction that stores the event or report;
// events and reports stay as the audit trail. Raw SQL on the shared
// DataSource, like AlertaService.
//
// Locks keep the counts consistent under concurrent requests, always taken
// in the same order to avoid deadlocks: unit, then parada, then card.
@Injectable()
export class RidershipService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // One turnstile pass. With an idempotencyKey a retry returns the original
  // pass (user-web S7).
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
          const people = parada.personasEnParada;
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

      const people = await this.moveParadaCount(manager, parada.idParada, dto.tipo === "ENTRADA" ? 1 : -1);
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

  // bus-passenger-report S3-S6: the pilot reports, at the unit's current
  // stop, who got off (first) and who got on. Boarding more people than the
  // parada counts is accepted (S4: the parada count floors at 0); the bus
  // limits are strict.
  async reportStop(employeeId: string, dto: StopReportRequestDto): Promise<StopReportDto> {
    const idParadaUnidad = await this.dataSource.transaction(async (manager) => {
      const unit = await this.findPilotUnit(manager, employeeId, true);
      if (unit.idParadaActual === null) throw new NoCurrentStop();
      const parada = await this.lockParada(manager, unit.idParadaActual);

      const onBoard = await this.onBoard(manager, unit);
      if (dto.bajaron > onBoard) throw new TooManyGettingOff(dto.bajaron, onBoard);
      const after = onBoard - dto.bajaron + dto.subieron;
      if (after > unit.capacidadPasajeros) throw new OverCapacity(after, unit.capacidadPasajeros);

      // People who got off join the parada; people who got on leave it. More
      // boarding than the parada counts is accepted (S4): the count floors at 0.
      await this.moveParadaCount(manager, parada.idParada, dto.bajaron - dto.subieron);

      const inserted = (await manager.query(
        `INSERT INTO tbl_parada_unidad
           (id_unidad, id_parada, id_empleado, bajaron, subieron, ocupacion_resultante, minutos_espera_extra)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_parada_unidad AS "id"`,
        [
          unit.idUnidad,
          parada.idParada,
          employeeId,
          dto.bajaron,
          dto.subieron,
          after,
          extraWaitMinutes(after, unit.capacidadPasajeros),
        ],
      )) as { id: string }[];
      return String(inserted[0]!.id);
    });

    const rows = (await this.dataSource.query(`${REPORT_SELECT} WHERE pu.id_parada_unidad = $1`, [
      idParadaUnidad,
    ])) as ReportRow[];
    const unit = await this.findPilotUnit(this.dataSource, employeeId, false);
    return this.toReportDto(rows[0]!, unit.capacidadPasajeros);
  }

  // bus-passenger-report S7: the pilot's unit, people on board and the last
  // report.
  async getMyUnit(employeeId: string): Promise<UnitOccupancyDto> {
    return this.toUnitDto(this.dataSource, await this.findPilotUnit(this.dataSource, employeeId, false));
  }

  // bus-passenger-report S9: the same reading for central operation.
  async getUnit(idUnidad: string): Promise<UnitOccupancyDto> {
    return this.toUnitDto(this.dataSource, await this.findUnit(this.dataSource, idUnidad));
  }

  // parada-ridership S8
  async getParada(idParada: string): Promise<ParadaOccupancyDto> {
    const parada = await this.findParada(this.dataSource, idParada, false);
    return {
      ...this.toParadaDto(parada, parada.personasEnParada),
      alertaActiva: await this.hasOpenAlert(this.dataSource, parada.idParada),
    };
  }

  // Newest capacity alerts, with their parada (and station, if any).
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

  // bus-passenger-report S2, S4: applies a change to the parada's current
  // count, never below 0, and returns the new count. The caller holds the
  // parada row lock. The floor sticks: an exit at an empty parada, or more
  // boarding than counted, never eats later entries.
  private async moveParadaCount(runner: Queryable, idParada: string, delta: number): Promise<number> {
    const updated = (await runner.query(
      `UPDATE tbl_parada SET personas_en_parada = GREATEST(0, personas_en_parada + $1)
        WHERE id_parada = $2
        RETURNING personas_en_parada AS "people"`,
      [delta, idParada],
    )) as [{ people: number }[], number] | { people: number }[];
    return Number(firstRow(updated).people);
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

  private async lastReport(runner: Queryable, idUnidad: string): Promise<ReportRow | null> {
    const rows = (await runner.query(
      `${REPORT_SELECT}
        WHERE pu.id_unidad = $1
        ORDER BY pu.fecha_reporte DESC, pu.id_parada_unidad DESC
        LIMIT 1`,
      [idUnidad],
    )) as ReportRow[];
    return rows[0] ?? null;
  }

  // The resulting occupancy of the unit's last report (0 without reports).
  private async onBoard(runner: Queryable, unit: UnitRow): Promise<number> {
    const last = await this.lastReport(runner, unit.idUnidad);
    return last ? Number(last.ocupacionResultante) : 0;
  }

  // tbl_asignacion_piloto has one row per pilot (id_empleado UNIQUE); the
  // current stop is the unit's last reported tbl_linea_parada, if any.
  // FOR UPDATE OF u: only the unit row is locked (the outer joins are
  // nullable), and it serializes the unit's reports.
  private async findPilotUnit(runner: Queryable, employeeId: string, lock: boolean): Promise<PilotUnitRow> {
    const rows = (await runner.query(
      `SELECT u.id_unidad AS "idUnidad",
              u.numero_placa AS "numeroPlaca",
              u.capacidad_pasajeros AS "capacidadPasajeros",
              lp.id_parada AS "idParadaActual"
         FROM tbl_asignacion_piloto ap
        INNER JOIN tbl_unidad u ON u.id_unidad = ap.id_unidad
         LEFT JOIN tbl_asignacion_unidad au ON au.id_unidad = u.id_unidad
         LEFT JOIN tbl_linea_parada lp ON lp.id_linea_parada = au.id_linea_parada_actual
        WHERE ap.id_empleado = $1
        ${lock ? "FOR UPDATE OF u" : ""}`,
      [employeeId],
    )) as PilotUnitRow[];
    const row = rows[0];
    if (!row) throw new PilotHasNoUnitAssigned();
    return {
      idUnidad: String(row.idUnidad),
      numeroPlaca: row.numeroPlaca,
      capacidadPasajeros: Number(row.capacidadPasajeros),
      idParadaActual: nullableId(row.idParadaActual),
    };
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
              p.personas_en_parada AS "personasEnParada",
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
      personasEnParada: Number(row.personasEnParada),
    };
  }

  private async findUnit(runner: Queryable, idUnidad: string): Promise<UnitRow> {
    if (!NUMERIC_ID.test(idUnidad)) throw new UnitNotFound(idUnidad);
    const rows = (await runner.query(
      `SELECT id_unidad AS "idUnidad",
              numero_placa AS "numeroPlaca",
              capacidad_pasajeros AS "capacidadPasajeros"
         FROM tbl_unidad WHERE id_unidad = $1`,
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

  private async toUnitDto(runner: Queryable, unit: UnitRow): Promise<UnitOccupancyDto> {
    const last = await this.lastReport(runner, unit.idUnidad);
    const aBordo = last ? Number(last.ocupacionResultante) : 0;
    return {
      idUnidad: unit.idUnidad,
      numeroPlaca: unit.numeroPlaca,
      capacidadPasajeros: unit.capacidadPasajeros,
      aBordo,
      porcentaje: percentOf(aBordo, unit.capacidadPasajeros),
      ultimoReporte: last ? this.toReportDto(last, unit.capacidadPasajeros) : null,
    };
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

  private toReportDto(row: ReportRow, capacity: number): StopReportDto {
    const aBordo = Number(row.ocupacionResultante);
    return {
      idParadaUnidad: String(row.idParadaUnidad),
      idParada: String(row.idParada),
      nombreParada: row.nombreParada,
      bajaron: Number(row.bajaron),
      subieron: Number(row.subieron),
      aBordo,
      porcentaje: percentOf(aBordo, capacity),
      minutosEsperaExtra: Number(row.minutosEsperaExtra),
      fecha: new Date(row.fechaReporte).toISOString(),
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
