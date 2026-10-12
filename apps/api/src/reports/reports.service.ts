import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AUDIT_RESULTS } from "../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../authentication/entities/employee.entity.js";
import { AuditRepository } from "../authentication/infrastructure/audit.repository.js";
import type { AuditActor } from "../fleet/shared/fleet.contracts.js";
import { ValidationError } from "../shared/errors/domain-exception.filter.js";
import { PdfRenderer } from "./pdf/pdf-renderer.js";
import type { DateRange, ExportedReport, ReportDocument, ReportType } from "./reports.contracts.js";
import {
  AUDIT_RESULT_LABELS,
  EMPLOYEE_STATUS_LABELS,
  label,
  LINE_STATUS_LABELS,
  ROUTE_TYPE_LABELS,
  STOP_STATUS_LABELS,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "./reports.labels.js";

export const REPORTS_MODULE = "reports";
export const EXPORT_REPORT_ACTION = "export_report";
const REPORT_ENTITY_TYPE = "report";
const UNASSIGNED = "Sin asignar";

const FILE_PREFIX: Record<ReportType, string> = {
  fleet: "reporte-flota",
  personnel: "reporte-personal",
  infrastructure: "reporte-infraestructura",
  "audit-log": "reporte-bitacora",
};

interface UnitRow {
  plate: string;
  brand: string;
  model: string;
  year: number | string;
  capacity: number | string;
  status: string;
  lineNumber: string | null;
  lineName: string | null;
  pilotName: string | null;
}

interface EmployeeRow {
  name: string;
  email: string;
  status: string;
  roleName: string;
}

interface LineRow {
  id: string;
  number: string;
  name: string;
  status: string;
  routeType: string;
  municipalities: string | null;
}

interface LineStopRow {
  lineId: string;
  order: number | string;
  stopName: string;
  stopStatus: string;
  stationName: string | null;
}

interface AuditByActionRow {
  module: string;
  action: string;
  result: string;
  total: string | number;
}

interface AuditByUserRow {
  name: string;
  email: string;
  total: string | number;
}

// Read-only reports over existing tables, rendered as PDF. Every successful
// export writes one audit row (module "reports", action "export_report");
// a failed query, validation or rendering writes none.
@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditRepo: AuditRepository,
    private readonly renderer: PdfRenderer,
  ) {}

  async export(type: ReportType, actor: AuditActor, range?: DateRange): Promise<ExportedReport> {
    if (type === "audit-log") validateRange(range);

    const manager = this.dataSource.manager;
    const actorEntity = await manager
      .getRepository(EmployeeEntity)
      .findOneOrFail({ where: { id: actor.employeeId } });

    const report = await this.build(type, range);
    const generatedAt = new Date();
    const content = await this.renderer.render(report, { generatedBy: actorEntity.name, generatedAt });

    await this.auditRepo.create(manager, {
      action: EXPORT_REPORT_ACTION,
      employee: actorEntity,
      entityId: actor.employeeId,
      entityType: REPORT_ENTITY_TYPE,
      module: REPORTS_MODULE,
      result: AUDIT_RESULTS.SUCCESS,
      detalle: range ? { report: type, from: range.from, to: range.to } : { report: type },
    });

    return { fileName: fileNameOf(type, generatedAt, range), content };
  }

  private build(type: ReportType, range?: DateRange): Promise<ReportDocument> {
    switch (type) {
      case "fleet":
        return this.fleetReport();
      case "personnel":
        return this.personnelReport();
      case "infrastructure":
        return this.infrastructureReport();
      case "audit-log":
        return this.auditSummaryReport(range!);
    }
  }

  private async fleetReport(): Promise<ReportDocument> {
    const units = (await this.dataSource.query(
      `SELECT u.numero_placa AS "plate", u.marca AS "brand", u.modelo AS "model", u.anio AS "year",
              u.capacidad_pasajeros AS "capacity", u.estado_unidad AS "status",
              l.numero_linea AS "lineNumber", l.nombre_linea AS "lineName", e.nombre_emple AS "pilotName"
         FROM tbl_unidad u
         LEFT JOIN tbl_asignacion_unidad au ON au.id_unidad = u.id_unidad
         LEFT JOIN tbl_linea l ON l.id_linea = au.id_linea
         LEFT JOIN tbl_asignacion_piloto ap ON ap.id_unidad = u.id_unidad
         LEFT JOIN tbl_empleado e ON e.id_emple = ap.id_empleado
        ORDER BY u.numero_placa`,
    )) as UnitRow[];

    // Fixed state order first; any unexpected state is appended so no unit is lost.
    const states = [...UNIT_STATUS_ORDER, ...new Set(units.map((u) => u.status))].filter(
      (state, index, all) => all.indexOf(state) === index,
    );
    const byState = states.map((state) => ({ state, units: units.filter((u) => u.status === state) }));

    return {
      title: "Reporte de flota",
      subtitle: "Unidades por estado y asignaciones",
      summary: [
        ["Total de unidades", String(units.length)],
        ...byState.map(({ state, units: group }): [string, string] => [
          label(UNIT_STATUS_LABELS, state),
          String(group.length),
        ]),
      ],
      sections: byState.map(({ state, units: group }) => ({
        heading: `${label(UNIT_STATUS_LABELS, state)} (${group.length})`,
        columns: ["Placa", "Marca / modelo", "Año", "Capacidad", "Línea", "Piloto"],
        rows: group.map((u) => [
          u.plate,
          `${u.brand} ${u.model}`,
          String(u.year),
          String(u.capacity),
          u.lineNumber ? `${u.lineNumber} - ${u.lineName}` : UNASSIGNED,
          u.pilotName ?? UNASSIGNED,
        ]),
        emptyMessage: "Sin unidades en este estado.",
      })),
    };
  }

  private async personnelReport(): Promise<ReportDocument> {
    const employees = (await this.dataSource.query(
      `SELECT e.nombre_emple AS "name", e.correo_emple AS "email", e.estado_emple AS "status",
              r.nombre_rol AS "roleName"
         FROM tbl_empleado e JOIN tbl_rol r ON r.id_rol = e.id_rol
        ORDER BY r.nombre_rol, e.nombre_emple`,
    )) as EmployeeRow[];

    const roles = [...new Set(employees.map((e) => e.roleName))];
    const count = (status: string) => employees.filter((e) => e.status === status).length;

    return {
      title: "Reporte de personal",
      subtitle: "Empleados por rol y estado",
      summary: [
        ["Total de empleados", String(employees.length)],
        ["Activos", String(count("ACTIVO"))],
        ["Inactivos", String(count("INACTIVO"))],
      ],
      sections: roles.map((role) => {
        const group = employees.filter((e) => e.roleName === role);
        return {
          heading: `${role} (${group.length})`,
          columns: ["Nombre", "Correo", "Estado"],
          rows: group.map((e) => [e.name, e.email, label(EMPLOYEE_STATUS_LABELS, e.status)]),
        };
      }),
    };
  }

  private async infrastructureReport(): Promise<ReportDocument> {
    const lines = (await this.dataSource.query(
      `SELECT l.id_linea AS "id", l.numero_linea AS "number", l.nombre_linea AS "name",
              l.estado_linea AS "status", l.tipo_recorrido AS "routeType",
              COALESCE(string_agg(m.nombre_municipalidad, ', ' ORDER BY m.nombre_municipalidad), '') AS "municipalities"
         FROM tbl_linea l
         LEFT JOIN tbl_linea_municipalidad lm ON lm.id_linea = l.id_linea
         LEFT JOIN tbl_municipalidad m ON m.id_municipalidad = lm.id_municipalidad
        GROUP BY l.id_linea
        ORDER BY l.numero_linea`,
    )) as LineRow[];
    const stops = (await this.dataSource.query(
      `SELECT lp.id_linea AS "lineId", lp.orden AS "order", p.nombre_parada AS "stopName",
              p.estado_parada AS "stopStatus", es.nombre_estacion AS "stationName"
         FROM tbl_linea_parada lp
         JOIN tbl_parada p ON p.id_parada = lp.id_parada
         LEFT JOIN tbl_estacion es ON es.id_parada = p.id_parada
        ORDER BY lp.id_linea, lp.orden`,
    )) as LineStopRow[];

    return {
      title: "Reporte de infraestructura",
      subtitle: "Líneas, estaciones y paradas",
      summary: [
        ["Total de líneas", String(lines.length)],
        ["Líneas activas", String(lines.filter((l) => l.status === "ACTIVA").length)],
        ["Paradas asignadas", String(stops.length)],
        ["Estaciones", String(stops.filter((s) => s.stationName).length)],
      ],
      sections: lines.map((line) => ({
        heading: `Línea ${line.number} - ${line.name} (${label(LINE_STATUS_LABELS, line.status)}, ${label(ROUTE_TYPE_LABELS, line.routeType)})`,
        note: `Municipios: ${line.municipalities || "Sin municipios asignados"}`,
        columns: ["Orden", "Parada", "Estación", "Estado"],
        rows: stops
          .filter((s) => String(s.lineId) === String(line.id))
          .map((s) => [String(s.order), s.stopName, s.stationName ?? "-", label(STOP_STATUS_LABELS, s.stopStatus)]),
        emptyMessage: "La línea no tiene paradas asignadas.",
      })),
    };
  }

  private async auditSummaryReport(range: DateRange): Promise<ReportDocument> {
    // Date-only bounds resolve in the DB session time zone, like the audit log viewer.
    const params = [range.from, nextDay(range.to)];
    const where = "WHERE b.fecha_hora >= $1 AND b.fecha_hora < $2";
    const byAction = (await this.dataSource.query(
      `SELECT b.modulo AS "module", b.accion AS "action", b.resultado AS "result", COUNT(*) AS "total"
         FROM tbl_bitacora b ${where}
        GROUP BY b.modulo, b.accion, b.resultado
        ORDER BY b.modulo, b.accion, b.resultado`,
      params,
    )) as AuditByActionRow[];
    const byUser = (await this.dataSource.query(
      `SELECT e.nombre_emple AS "name", e.correo_emple AS "email", COUNT(*) AS "total"
         FROM tbl_bitacora b JOIN tbl_empleado e ON e.id_emple = b.id_empleado ${where}
        GROUP BY e.id_emple, e.nombre_emple, e.correo_emple
        ORDER BY COUNT(*) DESC, e.nombre_emple`,
      params,
    )) as AuditByUserRow[];

    const total = byAction.reduce((sum, row) => sum + Number(row.total), 0);
    return {
      title: "Resumen de bitácora",
      subtitle: `Del ${range.from} al ${range.to}`,
      summary: [
        ["Total de acciones", String(total)],
        ["Usuarios con actividad", String(byUser.length)],
      ],
      sections: [
        {
          heading: "Acciones por módulo",
          columns: ["Módulo", "Acción", "Resultado", "Cantidad"],
          rows: byAction.map((r) => [r.module, r.action, label(AUDIT_RESULT_LABELS, r.result), String(Number(r.total))]),
          emptyMessage: "No hay acciones registradas en el rango.",
        },
        {
          heading: "Acciones por usuario",
          columns: ["Usuario", "Correo", "Cantidad"],
          rows: byUser.map((r) => [r.name, r.email, String(Number(r.total))]),
          emptyMessage: "No hay acciones registradas en el rango.",
        },
      ],
    };
  }
}

function validateRange(range: DateRange | undefined): asserts range is DateRange {
  if (!range?.from || !range.to) {
    throw new ValidationError("Debe indicar la fecha inicial y la fecha final.");
  }
  // YYYY-MM-DD compares chronologically as text.
  if (range.from > range.to) {
    throw new ValidationError("La fecha inicial no puede ser posterior a la fecha final.");
  }
}

function fileNameOf(type: ReportType, generatedAt: Date, range?: DateRange): string {
  const suffix = range ? `${range.from}_${range.to}` : generatedAt.toISOString().slice(0, 10);
  return `${FILE_PREFIX[type]}-${suffix}.pdf`;
}

// Next calendar date as YYYY-MM-DD (same rule as AuditLogService).
function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
