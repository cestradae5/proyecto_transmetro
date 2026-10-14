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
  ESTADOS_ALERTA,
  SENT_ALERTS_LIMIT,
  STATION_ALERTS_LIMIT,
  TIPO_DESTINO_ESTACION,
  TIPO_ORIGEN_UNIDAD,
  type EstadoAlerta,
} from "./alerta.constants.js";
import type {
  AlertaDestinationDto,
  AlertaDestinationsResponseDto,
  AlertaEstacionDto,
  AlertaResponseDto,
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
}

interface LockedAlertRow {
  estadoAlerta: EstadoAlerta;
  idEstacionDestino: string | null;
}

const ALERT_SELECT = `
  SELECT a.id_alerta AS "idAlerta",
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
         emp.nombre_emple AS "nombreEmpleado"
    FROM tbl_alerta a
    LEFT JOIN tbl_unidad u ON u.id_unidad = a.id_unidad
    LEFT JOIN tbl_estacion e ON e.id_estacion = a.id_estacion_destino
   INNER JOIN tbl_empleado emp ON emp.id_emple = a.id_empleado`;

const NUMERIC_ID = /^\d+$/;

// Operational alerts v1: a pilot sends a predefined alert from their unit to
// a station of their line; the operator of that station moves it forward
// (PENDIENTE -> RECIBIDA -> EN_ATENCION -> RESUELTA). Same stateless raw-SQL
// dataSource pattern as fleet's EstacionOperadorService. The unit and author
// always come from the caller's assignment, never from the request body.
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
         (tipo_alerta, tipo_origen, tipo_destino, estado_alerta, id_unidad, id_estacion_destino, id_empleado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id_alerta AS "idAlerta"`,
      [
        dto.tipoAlerta,
        TIPO_ORIGEN_UNIDAD,
        TIPO_DESTINO_ESTACION,
        "PENDIENTE",
        String(unit.idUnidad),
        dto.idEstacionDestino,
        employeeId,
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

  async getMyStation(employeeId: string): Promise<StationAlertsResponseDto> {
    const station = await this.findOperatorStation(this.dataSource, employeeId);
    const rows = (await this.dataSource.query(
      `${ALERT_SELECT}
        WHERE a.id_estacion_destino = $1
        ORDER BY a.fecha_creacion DESC, a.id_alerta DESC
        LIMIT ${STATION_ALERTS_LIMIT}`,
      [station.idEstacion],
    )) as AlertRow[];
    return { station, alerts: rows.map((row) => this.toDto(row)) };
  }

  async updateStatus(
    employeeId: string,
    idAlerta: string,
    dto: UpdateAlertaStatusDto,
  ): Promise<AlertaResponseDto> {
    if (!NUMERIC_ID.test(idAlerta)) {
      throw new AlertNotFound(idAlerta);
    }

    await this.dataSource.transaction(async (manager) => {
      const station = await this.findOperatorStation(manager, employeeId);

      // Row lock: two operators of the same station cannot both apply a
      // transition computed from the same previous state.
      const locked = (await manager.query(
        `SELECT estado_alerta AS "estadoAlerta",
                id_estacion_destino AS "idEstacionDestino"
           FROM tbl_alerta
          WHERE id_alerta = $1
          FOR UPDATE`,
        [idAlerta],
      )) as LockedAlertRow[];
      const alert = locked[0];
      // An alert of another station is reported as missing, not forbidden,
      // so operators cannot probe other stations' alert ids.
      if (!alert || String(alert.idEstacionDestino) !== station.idEstacion) {
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
    };
  }
}
