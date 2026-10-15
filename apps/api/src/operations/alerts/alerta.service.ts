import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { ESTADO_ASIGNACION } from "../../fleet/asignacion-estacion/asignacion-estacion.entity.js";
import {
  OperatorHasNoStation,
  PilotHasNoUnitAssigned,
} from "../../fleet/shared/fleet.errors.js";
import { EstadoAsignacionLinea } from "../../infrastructure/estacion/estacion-linea.entity.js";
import {
  AlertNotFound,
  DestinationNotOnLine,
  InvalidAlertTransition,
  UnitHasNoLine,
} from "../shared/operations.errors.js";
import {
  CENTRAL_ALERTS_LIMIT,
  ESTADOS_ALERTA,
  SENT_ALERTS_LIMIT,
  STATION_ALERTS_LIMIT,
  TIPO_DESTINO_ESTACION,
  TIPO_ORIGEN_UNIDAD,
  type EstadoAlerta,
} from "./alerta.constants.js";
import type {
  AlertaCentralLineaDto,
  AlertaDestinationDto,
  AlertaDestinationsResponseDto,
  AlertaEstacionDto,
  AlertaLineaDto,
  AlertaResponseDto,
  CentralAlertsResponseDto,
  StationAlertsResponseDto,
} from "./dto/alerta-response.dto.js";
import type { CreateAlertaDto } from "./dto/create-alerta.dto.js";
import type { UpdateAlertaStatusDto } from "./dto/update-alerta-status.dto.js";

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

interface UnitLineRow {
  idUnidad: string;
  numeroPlaca: string;
  idLinea: string | null;
  numeroLinea: string | null;
  nombreLinea: string | null;
  ordenActual: number | null;
}

interface LineStationRow {
  idEstacion: string;
  nombreEstacion: string;
  orden: number | null;
}

interface AlertRow {
  idAlerta: string;
  tipoAlerta: string;
  tipoOrigen: string;
  tipoDestino: string;
  estadoAlerta: string;
  fechaCreacion: Date | string;
  fechaActualizacion: Date | string;
  idUnidad: string | null;
  numeroPlaca: string | null;
  idEstacion: string | null;
  nombreEstacion: string | null;
  idEmpleado: string;
  nombreEmpleado: string;
  idLinea: string | null;
  numeroLinea: string | null;
  nombreLinea: string | null;
  observaciones?: ObservacionRow[] | null;
}

// One json_agg element of ALERT_COLUMNS' "observaciones" subquery.
interface ObservacionRow {
  estadoNuevo: string;
  observacion: string;
  fechaCambio: string;
  idEmpleado: string | number;
  nombre: string;
}

interface LockedAlertRow {
  estadoAlerta: EstadoAlerta;
  idEstacionDestino: string | null;
  // The alert's stored line is an ACTIVA line of its destination station.
  lineaActiva: boolean;
}

const ALERT_COLUMNS = `
         a.id_alerta AS "idAlerta",
         a.tipo_alerta AS "tipoAlerta",
         a.tipo_origen AS "tipoOrigen",
         a.tipo_destino AS "tipoDestino",
         a.estado_alerta AS "estadoAlerta",
         a.fecha_creacion AS "fechaCreacion",
         a.fecha_actualizacion AS "fechaActualizacion",
         u.id_unidad AS "idUnidad",
         u.numero_placa AS "numeroPlaca",
         e.id_estacion AS "idEstacion",
         e.nombre_estacion AS "nombreEstacion",
         emp.id_emple AS "idEmpleado",
         emp.nombre_emple AS "nombreEmpleado",
         l.id_linea AS "idLinea",
         l.numero_linea AS "numeroLinea",
         l.nombre_linea AS "nombreLinea",
         COALESCE((
           SELECT json_agg(json_build_object(
                    'estadoNuevo', h.estado_nuevo,
                    'observacion', h.observacion,
                    'fechaCambio', h.fecha_cambio,
                    'idEmpleado', h.id_empleado::text,
                    'nombre', he.nombre_emple)
                  ORDER BY h.fecha_cambio, h.id_historial_estado)
             FROM tbl_historial_estado h
            INNER JOIN tbl_empleado he ON he.id_emple = h.id_empleado
            WHERE h.id_alerta = a.id_alerta
              AND h.observacion IS NOT NULL AND btrim(h.observacion) <> ''
         ), '[]'::json) AS "observaciones"`;

const ALERT_FROM = `
    FROM tbl_alerta a
    LEFT JOIN tbl_unidad u ON u.id_unidad = a.id_unidad
    LEFT JOIN tbl_estacion e ON e.id_estacion = a.id_estacion_destino
    LEFT JOIN tbl_linea l ON l.id_linea = a.id_linea
   INNER JOIN tbl_empleado emp ON emp.id_emple = a.id_empleado`;

// The alert was sent from a line that is ACTIVA on its destination station.
// Uses $2 for the ACTIVA state.
const ALERT_LINE_ACTIVE_ON_STATION = `EXISTS (
           SELECT 1 FROM tbl_estacion_linea el
            WHERE el.id_estacion = a.id_estacion_destino
              AND el.id_linea = a.id_linea
              AND el.estado_asignacion = $2)`;

const ALERT_SELECT = `SELECT ${ALERT_COLUMNS} ${ALERT_FROM}`;

const NO_LINE_NAME = "Sin línea";

const NUMERIC_ID = /^\d+$/;

// Operational alerts v1: a pilot sends a predefined alert from their unit to
// a station of their line; the operator of that station moves it forward
// (PENDIENTE -> RECIBIDA -> EN_ATENCION -> RESUELTA). Same stateless raw-SQL
// dataSource pattern as fleet's EstacionOperadorService. The unit, its line
// and the author always come from the caller's assignment, never from the
// request body. The line is stored on the alert, so an operator only sees
// and answers alerts sent from an ACTIVA line of their station, even after
// the station or the unit change lines.
@Injectable()
export class AlertaService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getDestinations(employeeId: string): Promise<AlertaDestinationsResponseDto> {
    const unit = await this.findPilotUnitLine(employeeId);
    const stations = await this.findLineStations(unit.idLinea);
    return {
      unidad: { idUnidad: String(unit.idUnidad), numeroPlaca: unit.numeroPlaca },
      linea: {
        idLinea: String(unit.idLinea),
        numeroLinea: String(unit.numeroLinea),
        nombreLinea: String(unit.nombreLinea),
      },
      destinations: this.markSuggested(stations, unit.ordenActual),
    };
  }

  async create(employeeId: string, dto: CreateAlertaDto): Promise<AlertaResponseDto> {
    const unit = await this.findPilotUnitLine(employeeId);
    const stations = await this.findLineStations(unit.idLinea);
    if (!stations.some((station) => String(station.idEstacion) === dto.idEstacionDestino)) {
      throw new DestinationNotOnLine();
    }

    const inserted = (await this.dataSource.query(
      `INSERT INTO tbl_alerta
         (tipo_alerta, tipo_origen, tipo_destino, estado_alerta, id_unidad, id_estacion_destino, id_empleado, id_linea)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id_alerta AS "idAlerta"`,
      [
        dto.tipoAlerta,
        TIPO_ORIGEN_UNIDAD,
        TIPO_DESTINO_ESTACION,
        "PENDIENTE",
        String(unit.idUnidad),
        dto.idEstacionDestino,
        employeeId,
        unit.idLinea,
      ],
    )) as { idAlerta: string }[];

    return this.findById(String(inserted[0]!.idAlerta));
  }

  async listSent(employeeId: string): Promise<AlertaResponseDto[]> {
    const rows = (await this.dataSource.query(
      `${ALERT_SELECT}
        WHERE a.id_empleado = $1
        ORDER BY a.fecha_creacion DESC, a.id_alerta DESC
        LIMIT ${SENT_ALERTS_LIMIT}`,
      [employeeId],
    )) as AlertRow[];
    return rows.map((row) => this.toDto(row));
  }

  // Alerts of the operator's station sent from one of its ACTIVA lines. An
  // optional idLinea narrows them to one line; a line that is not ACTIVA on
  // the station yields no alerts instead of an error, so it leaks nothing.
  async getMyStation(employeeId: string, idLinea?: string): Promise<StationAlertsResponseDto> {
    const station = await this.findOperatorStation(this.dataSource, employeeId);
    const lineas = await this.findStationLines(station.idEstacion);
    const filter = idLinea ? idLinea : null;
    if (filter !== null && !lineas.some((linea) => linea.idLinea === filter)) {
      return { station, lineas, alerts: [] };
    }

    const params: string[] = [station.idEstacion, EstadoAsignacionLinea.ACTIVA];
    if (filter !== null) params.push(filter);
    const rows = (await this.dataSource.query(
      `${ALERT_SELECT}
        WHERE a.id_estacion_destino = $1
          AND ${ALERT_LINE_ACTIVE_ON_STATION}
          ${filter !== null ? "AND a.id_linea = $3" : ""}
        ORDER BY a.fecha_creacion DESC, a.id_alerta DESC
        LIMIT ${STATION_ALERTS_LIMIT}`,
      params,
    )) as AlertRow[];
    return { station, lineas, alerts: rows.map((row) => this.toDto(row)) };
  }

  // Central view (ALERTAS_OPERATIVAS_GESTIONAR): the newest unit -> station
  // alerts of every station, grouped line -> station -> unit. An alert is
  // grouped under the line it was sent from (tbl_alerta.id_linea); alerts
  // without stored line go to a last "Sin línea" group.
  async getCentral(): Promise<CentralAlertsResponseDto> {
    const rows = (await this.dataSource.query(
      `${ALERT_SELECT}
        WHERE a.tipo_origen = $1 AND a.tipo_destino = $2
        ORDER BY a.fecha_creacion DESC, a.id_alerta DESC
        LIMIT ${CENTRAL_ALERTS_LIMIT}`,
      [TIPO_ORIGEN_UNIDAD, TIPO_DESTINO_ESTACION],
    )) as AlertRow[];
    return { lineas: this.groupCentral(rows) };
  }

  async updateStatus(
    employeeId: string,
    idAlerta: string,
    dto: UpdateAlertaStatusDto,
  ): Promise<AlertaResponseDto> {
    return this.transition(employeeId, idAlerta, dto, true);
  }

  // Central users advance any alert: same rules and history as the station
  // operator, without station scoping.
  async updateCentralStatus(
    employeeId: string,
    idAlerta: string,
    dto: UpdateAlertaStatusDto,
  ): Promise<AlertaResponseDto> {
    return this.transition(employeeId, idAlerta, dto, false);
  }

  private async transition(
    employeeId: string,
    idAlerta: string,
    dto: UpdateAlertaStatusDto,
    scopeToOperatorStation: boolean,
  ): Promise<AlertaResponseDto> {
    if (!NUMERIC_ID.test(idAlerta)) {
      throw new AlertNotFound(idAlerta);
    }

    await this.dataSource.transaction(async (manager) => {
      const station = scopeToOperatorStation
        ? await this.findOperatorStation(manager, employeeId)
        : null;

      // Row lock: two operators of the same station cannot both apply a
      // transition computed from the same previous state.
      const locked = (await manager.query(
        `SELECT a.estado_alerta AS "estadoAlerta",
                a.id_estacion_destino AS "idEstacionDestino",
                ${ALERT_LINE_ACTIVE_ON_STATION} AS "lineaActiva"
           FROM tbl_alerta a
          WHERE a.id_alerta = $1
          FOR UPDATE`,
        [idAlerta, EstadoAsignacionLinea.ACTIVA],
      )) as LockedAlertRow[];
      const alert = locked[0];
      // An alert of another station, or sent from a line the station no
      // longer has ACTIVA, is reported as missing, not forbidden, so
      // operators cannot probe other stations' or lines' alert ids.
      if (
        !alert ||
        (station &&
          (String(alert.idEstacionDestino) !== station.idEstacion || !alert.lineaActiva))
      ) {
        throw new AlertNotFound(idAlerta);
      }

      if (ESTADOS_ALERTA.indexOf(dto.estado) <= ESTADOS_ALERTA.indexOf(alert.estadoAlerta)) {
        throw new InvalidAlertTransition(alert.estadoAlerta, dto.estado);
      }

      await manager.query(
        `UPDATE tbl_alerta
            SET estado_alerta = $1, fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE id_alerta = $2`,
        [dto.estado, idAlerta],
      );
      await manager.query(
        `INSERT INTO tbl_historial_estado
           (estado_anterior, estado_nuevo, observacion, id_alerta, id_empleado)
         VALUES ($1, $2, $3, $4, $5)`,
        [alert.estadoAlerta, dto.estado, dto.observacion ?? null, idAlerta, employeeId],
      );
    });

    return this.findById(idAlerta);
  }

  private async findById(idAlerta: string): Promise<AlertaResponseDto> {
    const rows = (await this.dataSource.query(`${ALERT_SELECT} WHERE a.id_alerta = $1`, [
      idAlerta,
    ])) as AlertRow[];
    if (!rows[0]) {
      throw new AlertNotFound(idAlerta);
    }
    return this.toDto(rows[0]);
  }

  // tbl_asignacion_piloto has one row per pilot (id_empleado UNIQUE); the
  // line assignment and last reported stop are optional.
  private async findPilotUnitLine(
    employeeId: string,
  ): Promise<UnitLineRow & { idLinea: string }> {
    const rows = (await this.dataSource.query(
      `SELECT u.id_unidad AS "idUnidad",
              u.numero_placa AS "numeroPlaca",
              au.id_linea AS "idLinea",
              l.numero_linea AS "numeroLinea",
              l.nombre_linea AS "nombreLinea",
              lp.orden AS "ordenActual"
         FROM tbl_asignacion_piloto ap
        INNER JOIN tbl_unidad u ON u.id_unidad = ap.id_unidad
         LEFT JOIN tbl_asignacion_unidad au ON au.id_unidad = u.id_unidad
         LEFT JOIN tbl_linea l ON l.id_linea = au.id_linea
         LEFT JOIN tbl_linea_parada lp ON lp.id_linea_parada = au.id_linea_parada_actual
        WHERE ap.id_empleado = $1
        LIMIT 1`,
      [employeeId],
    )) as UnitLineRow[];
    const row = rows[0];
    if (!row) {
      throw new PilotHasNoUnitAssigned();
    }
    if (row.idLinea === null || row.idLinea === undefined) {
      throw new UnitHasNoLine();
    }
    return { ...row, idLinea: String(row.idLinea) };
  }

  // Stations linked to the line (ACTIVA), in route order of their stop on
  // that line; a station whose stop is not on the line goes last.
  private async findLineStations(idLinea: string): Promise<LineStationRow[]> {
    return (await this.dataSource.query(
      `SELECT e.id_estacion AS "idEstacion",
              e.nombre_estacion AS "nombreEstacion",
              lp.orden AS "orden"
         FROM tbl_estacion_linea el
        INNER JOIN tbl_estacion e ON e.id_estacion = el.id_estacion
         LEFT JOIN tbl_linea_parada lp ON lp.id_linea = el.id_linea AND lp.id_parada = e.id_parada
        WHERE el.id_linea = $1 AND el.estado_asignacion = $2
        ORDER BY lp.orden ASC NULLS LAST, e.nombre_estacion ASC`,
      [idLinea, EstadoAsignacionLinea.ACTIVA],
    )) as LineStationRow[];
  }

  // ACTIVA lines of a station, by line number.
  private async findStationLines(idEstacion: string): Promise<AlertaLineaDto[]> {
    const rows = (await this.dataSource.query(
      `SELECT l.id_linea AS "idLinea",
              l.numero_linea AS "numeroLinea",
              l.nombre_linea AS "nombreLinea"
         FROM tbl_estacion_linea el
        INNER JOIN tbl_linea l ON l.id_linea = el.id_linea
        WHERE el.id_estacion = $1 AND el.estado_asignacion = $2
        ORDER BY l.numero_linea ASC, l.id_linea ASC`,
      [idEstacion, EstadoAsignacionLinea.ACTIVA],
    )) as AlertaLineaDto[];
    return rows.map((row) => ({
      idLinea: String(row.idLinea),
      numeroLinea: String(row.numeroLinea),
      nombreLinea: String(row.nombreLinea),
    }));
  }

  private async findOperatorStation(
    runner: Queryable,
    employeeId: string,
  ): Promise<AlertaEstacionDto> {
    const rows = (await runner.query(
      `SELECT e.id_estacion AS "idEstacion",
              e.nombre_estacion AS "nombreEstacion"
         FROM tbl_asignacion_estacion a
        INNER JOIN tbl_estacion e ON e.id_estacion = a.id_estacion
        WHERE a.id_empleado = $1 AND a.estado_asignacion = $2
        ORDER BY a.fecha_asignacion DESC
        LIMIT 1`,
      [employeeId, ESTADO_ASIGNACION.ACTIVA],
    )) as AlertaEstacionDto[];
    const row = rows[0];
    if (!row) {
      throw new OperatorHasNoStation();
    }
    return { idEstacion: String(row.idEstacion), nombreEstacion: row.nombreEstacion };
  }

  // Closest station to the last reported stop by route order; on a tie the
  // one ahead wins. Without a reported stop (or without ordered stations)
  // the first station is suggested.
  private markSuggested(
    stations: LineStationRow[],
    ordenActual: number | null,
  ): AlertaDestinationDto[] {
    let suggestedIndex = stations.length > 0 ? 0 : -1;
    if (ordenActual !== null && ordenActual !== undefined) {
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestOrden = Number.NEGATIVE_INFINITY;
      for (const [index, station] of stations.entries()) {
        if (station.orden === null || station.orden === undefined) continue;
        const orden = Number(station.orden);
        const distance = Math.abs(orden - Number(ordenActual));
        if (distance < bestDistance || (distance === bestDistance && orden > bestOrden)) {
          bestDistance = distance;
          bestOrden = orden;
          suggestedIndex = index;
        }
      }
    }

    return stations.map((station, index) => ({
      idEstacion: String(station.idEstacion),
      nombreEstacion: station.nombreEstacion,
      orden: station.orden === null || station.orden === undefined ? null : Number(station.orden),
      suggested: index === suggestedIndex,
    }));
  }

  private groupCentral(rows: AlertRow[]): AlertaCentralLineaDto[] {
    const lineas = new Map<string, AlertaCentralLineaDto>();
    for (const row of rows) {
      const lineKey = row.idLinea === null || row.idLinea === undefined ? "" : String(row.idLinea);
      let linea = lineas.get(lineKey);
      if (!linea) {
        linea = lineKey
          ? {
              idLinea: lineKey,
              numeroLinea: String(row.numeroLinea),
              nombreLinea: String(row.nombreLinea),
              estaciones: [],
            }
          : { idLinea: null, numeroLinea: null, nombreLinea: NO_LINE_NAME, estaciones: [] };
        lineas.set(lineKey, linea);
      }

      const alert = this.toDto(row);
      let estacion = linea.estaciones.find(
        (e) => e.idEstacion === alert.estacionDestino.idEstacion,
      );
      if (!estacion) {
        estacion = { ...alert.estacionDestino, unidades: [] };
        linea.estaciones.push(estacion);
      }
      let unidad = estacion.unidades.find((u) => u.idUnidad === alert.unidad.idUnidad);
      if (!unidad) {
        unidad = { ...alert.unidad, alerts: [] };
        estacion.unidades.push(unidad);
      }
      // Rows come newest first, so each unit's alerts stay newest first.
      unidad.alerts.push(alert);
    }

    const byText = (a: string, b: string) =>
      a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
    const sorted = [...lineas.values()].sort((a, b) => {
      if (a.numeroLinea === null) return 1;
      if (b.numeroLinea === null) return -1;
      return byText(a.numeroLinea, b.numeroLinea);
    });
    for (const linea of sorted) {
      linea.estaciones.sort((a, b) => byText(a.nombreEstacion, b.nombreEstacion));
      for (const estacion of linea.estaciones) {
        estacion.unidades.sort((a, b) => byText(a.numeroPlaca, b.numeroPlaca));
      }
    }
    return sorted;
  }

  private toDto(row: AlertRow): AlertaResponseDto {
    return {
      idAlerta: String(row.idAlerta),
      tipoAlerta: row.tipoAlerta,
      tipoOrigen: row.tipoOrigen,
      tipoDestino: row.tipoDestino,
      estadoAlerta: row.estadoAlerta,
      fechaCreacion: new Date(row.fechaCreacion).toISOString(),
      fechaActualizacion: new Date(row.fechaActualizacion).toISOString(),
      unidad: { idUnidad: String(row.idUnidad ?? ""), numeroPlaca: row.numeroPlaca ?? "" },
      estacionDestino: {
        idEstacion: String(row.idEstacion ?? ""),
        nombreEstacion: row.nombreEstacion ?? "",
      },
      autor: { idEmpleado: String(row.idEmpleado), nombre: row.nombreEmpleado },
      linea:
        row.idLinea === null || row.idLinea === undefined
          ? null
          : {
              idLinea: String(row.idLinea),
              numeroLinea: String(row.numeroLinea),
              nombreLinea: String(row.nombreLinea),
            },
      observaciones: (row.observaciones ?? []).map((obs) => ({
        estadoNuevo: obs.estadoNuevo,
        observacion: obs.observacion,
        fechaCambio: new Date(obs.fechaCambio).toISOString(),
        autor: { idEmpleado: String(obs.idEmpleado), nombre: obs.nombre },
      })),
    };
  }
}
