import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { EstadoAsignacionLinea } from "../../infrastructure/estacion/estacion-linea.entity.js";
import { ESTADO_ASIGNACION } from "../asignacion-estacion/asignacion-estacion.entity.js";
import { OperatorHasNoStation } from "../shared/fleet.errors.js";
import type {
  MiEstacionLineDto,
  MiEstacionResponseDto,
  MiEstacionStationDto,
  MiEstacionUnitDto,
} from "./dto/mi-estacion-response.dto.js";

interface StationRow {
  idEstacion: string;
  nombreEstacion: string;
  estadoEstacion: string;
  latitud: string | number;
  longitud: string | number;
  idParada: string | null;
  nombreParadaEstacion: string | null;
}

interface LineStopRow {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
  colorHex: string;
  estadoLinea: string;
  tipoPunto: string;
  idLineaParada: string | null;
  orden: number | null;
  idParada: string | null;
  nombreParada: string | null;
}

interface UnitRow {
  idUnidad: string;
  numeroPlaca: string;
  estadoUnidad: string;
  idLinea: string;
  idLineaParadaActual: string | null;
  nombreParadaActual: string | null;
  fechaReporteUbicacion: Date | null;
  pilotAssigned: boolean;
}

// Read-only "my station" view for a station operator, scoped by the
// operator's ACTIVA tbl_asignacion_estacion row. Same stateless dataSource
// pattern as OperadorEstacionService. The unit position fields mirror
// UnidadService.toResponseDto (idLineaParadaActual, nombreParadaActual,
// fechaReporteUbicacion) but are resolved in one joined query for all units
// instead of one lookup per unit; UnidadService's helper is private and also
// composes parqueo/line data this view does not need.
@Injectable()
export class EstacionOperadorService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getMyStation(employeeId: string): Promise<MiEstacionResponseDto> {
    const stationRow = await this.findActiveStation(employeeId);
    if (!stationRow) {
      throw new OperatorHasNoStation();
    }

    const lines = await this.findLines(stationRow.idEstacion, stationRow.idParada);
    const units = await this.findUnits(lines.map((line) => line.idLinea));

    return { station: this.toStationDto(stationRow), lines, units };
  }

  private async findActiveStation(employeeId: string): Promise<StationRow | null> {
    const rows = (await this.dataSource.query(
      `SELECT e.id_estacion AS "idEstacion",
              e.nombre_estacion AS "nombreEstacion",
              e.estado_estacion AS "estadoEstacion",
              e.latitud AS "latitud",
              e.longitud AS "longitud",
              e.id_parada AS "idParada",
              p.nombre_parada AS "nombreParadaEstacion"
         FROM tbl_asignacion_estacion a
         INNER JOIN tbl_estacion e ON e.id_estacion = a.id_estacion
         LEFT JOIN tbl_parada p ON p.id_parada = e.id_parada
        WHERE a.id_empleado = $1 AND a.estado_asignacion = $2
        ORDER BY a.fecha_asignacion DESC
        LIMIT 1`,
      [employeeId, ESTADO_ASIGNACION.ACTIVA],
    )) as StationRow[];
    return rows[0] ?? null;
  }

  private toStationDto(row: StationRow): MiEstacionStationDto {
    const station: MiEstacionStationDto = {
      idEstacion: String(row.idEstacion),
      nombreEstacion: row.nombreEstacion,
      estadoEstacion: row.estadoEstacion,
      latitud: Number(row.latitud),
      longitud: Number(row.longitud),
    };
    if (row.idParada !== null && row.idParada !== undefined) {
      station.parada = {
        idParada: String(row.idParada),
        nombreParada: row.nombreParadaEstacion ?? "",
      };
    }
    return station;
  }

  // Lines linked through ACTIVA tbl_estacion_linea, each with its ordered stops
  // (a line without stops still appears, with an empty `stops` array).
  private async findLines(
    idEstacion: string,
    stationStopId: string | null,
  ): Promise<MiEstacionLineDto[]> {
    const rows = (await this.dataSource.query(
      `SELECT l.id_linea AS "idLinea",
              l.numero_linea AS "numeroLinea",
              l.nombre_linea AS "nombreLinea",
              l.color_hex AS "colorHex",
              l.estado_linea AS "estadoLinea",
              el.tipo_punto AS "tipoPunto",
              lp.id_linea_parada AS "idLineaParada",
              lp.orden AS "orden",
              pa.id_parada AS "idParada",
              pa.nombre_parada AS "nombreParada"
         FROM tbl_estacion_linea el
         INNER JOIN tbl_linea l ON l.id_linea = el.id_linea
         LEFT JOIN tbl_linea_parada lp ON lp.id_linea = l.id_linea
         LEFT JOIN tbl_parada pa ON pa.id_parada = lp.id_parada
        WHERE el.id_estacion = $1 AND el.estado_asignacion = $2
        ORDER BY l.id_linea ASC, lp.orden ASC`,
      [idEstacion, EstadoAsignacionLinea.ACTIVA],
    )) as LineStopRow[];

    const lines = new Map<string, MiEstacionLineDto>();
    for (const row of rows) {
      const idLinea = String(row.idLinea);
      let line = lines.get(idLinea);
      if (!line) {
        line = {
          idLinea,
          numeroLinea: row.numeroLinea,
          nombreLinea: row.nombreLinea,
          colorHex: row.colorHex,
          estadoLinea: row.estadoLinea,
          tipoPunto: row.tipoPunto,
          stops: [],
        };
        lines.set(idLinea, line);
      }
      if (row.idLineaParada !== null && row.idLineaParada !== undefined) {
        const idParada = String(row.idParada);
        line.stops.push({
          idLineaParada: String(row.idLineaParada),
          orden: Number(row.orden),
          idParada,
          nombreParada: row.nombreParada ?? "",
          isStationStop: stationStopId !== null && String(stationStopId) === idParada,
        });
      }
    }
    return [...lines.values()];
  }

  // Units with an asignacion_unidad on any of the station's lines. A unit has
  // a pilot when a tbl_asignacion_piloto row exists (the table has no status).
  private async findUnits(lineIds: string[]): Promise<MiEstacionUnitDto[]> {
    if (lineIds.length === 0) {
      return [];
    }
    const rows = (await this.dataSource.query(
      `SELECT u.id_unidad AS "idUnidad",
              u.numero_placa AS "numeroPlaca",
              u.estado_unidad AS "estadoUnidad",
              au.id_linea AS "idLinea",
              au.id_linea_parada_actual AS "idLineaParadaActual",
              pa.nombre_parada AS "nombreParadaActual",
              au.fecha_reporte_ubicacion AS "fechaReporteUbicacion",
              (ap.id_asignacion_piloto IS NOT NULL) AS "pilotAssigned"
         FROM tbl_asignacion_unidad au
         INNER JOIN tbl_unidad u ON u.id_unidad = au.id_unidad
         LEFT JOIN tbl_linea_parada lp ON lp.id_linea_parada = au.id_linea_parada_actual
         LEFT JOIN tbl_parada pa ON pa.id_parada = lp.id_parada
         LEFT JOIN tbl_asignacion_piloto ap ON ap.id_unidad = u.id_unidad
        WHERE au.id_linea = ANY($1::bigint[])
        ORDER BY au.id_linea ASC, u.numero_placa ASC`,
      [lineIds],
    )) as UnitRow[];

    return rows.map((row) => {
      const unit: MiEstacionUnitDto = {
        idUnidad: String(row.idUnidad),
        numeroPlaca: row.numeroPlaca,
        estadoUnidad: row.estadoUnidad,
        idLinea: String(row.idLinea),
        pilotAssigned: Boolean(row.pilotAssigned),
      };
      if (row.idLineaParadaActual !== null && row.idLineaParadaActual !== undefined) {
        unit.idLineaParadaActual = String(row.idLineaParadaActual);
      }
      if (row.nombreParadaActual) {
        unit.nombreParadaActual = row.nombreParadaActual;
      }
      if (row.fechaReporteUbicacion) {
        unit.fechaReporteUbicacion = row.fechaReporteUbicacion;
      }
      return unit;
    });
  }
}
