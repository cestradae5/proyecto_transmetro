import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AUDIT_RESULTS } from "../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../authentication/entities/employee.entity.js";
import { AuditRepository } from "../authentication/infrastructure/audit.repository.js";
import type { AuditActor } from "../fleet/shared/fleet.contracts.js";
import { ValidationError } from "../shared/errors/domain-exception.filter.js";
import { PdfRenderer } from "./pdf/pdf-renderer.js";
import {
  RANGED_REPORT_TYPES,
  type DateRange,
  type ExportedReport,
  type ReportDocument,
  type ReportType,
} from "./reports.contracts.js";
import {
  ALERT_STATE_LABELS,
  ALERT_STATE_ORDER,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_ORDER,
  AUDIT_RESULT_LABELS,
  EMPLOYEE_STATUS_LABELS,
  label,
  LINE_STATUS_LABELS,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_ORDER,
  ROUTE_TYPE_LABELS,
  STOP_STATUS_LABELS,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "./reports.labels.js";

export const REPORTS_MODULE = "reports";
export const EXPORT_REPORT_ACTION = "export_report";
const REPORT_ENTITY_TYPE = "report";
const UNASSIGNED = "Sin asignar";
const NO_LINE = "Sin línea";
const NO_ALERTS = "No hay alertas en el rango.";
const ALERTS_DETAIL_LIMIT = 500;
const NO_PAYMENTS = "No hay pagos en el rango.";
const PAYMENTS_DETAIL_LIMIT = 500;
const TRIPS_DETAIL_LIMIT = 1000;
const TRIPS_LINE_NOTE = "La línea corresponde a la asignación actual de cada unidad.";

const FILE_PREFIX: Record<ReportType, string> = {
  fleet: "reporte-flota",
  personnel: "reporte-personal",
  infrastructure: "reporte-infraestructura",
  "audit-log": "reporte-bitacora",
  alerts: "reporte-alertas",
  payments: "reporte-pagos",
  "unit-trips": "reporte-viajes-unidades",
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

interface AlertCountRow {
  type: string;
  state: string;
  lineId: string | null;
  lineNumber: string | null;
  lineName: string | null;
  stationId: string | null;
  stationName: string | null;
  total: string | number;
}

interface AlertDetailRow {
  createdAt: string;
  type: string;
  state: string;
  lineNumber: string | null;
  lineName: string | null;
  stationName: string | null;
  plate: string | null;
  pilotName: string | null;
}

interface PaymentCountRow {
  state: string;
  total: string | number;
  amount: string | number;
}

interface PaymentDetailRow {
  createdAt: string;
  reference: string;
  cardNumber: string;
  amount: string | number;
  state: string;
  authorization: string | null;
}

interface UnitTripCountRow {
  unitId: string;
  plate: string;
  lineNumber: string | null;
  lineName: string | null;
  stops: string | number;
  boarded: string | number;
  alighted: string | number;
}

interface UnitTripStopRow {
  unitId: string;
  reportedAt: string;
  order: number | string | null;
  stopName: string;
  stationName: string | null;
  boarded: number | string;
  alighted: number | string;
  occupancy: number | string;
  pilotName: string | null;
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
    if (RANGED_REPORT_TYPES.includes(type)) validateRange(range);

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
      case "alerts":
        return this.alertsReport(range!);
      case "payments":
        return this.paymentsReport(range!);
      case "unit-trips":
        return this.unitTripsReport(range!);
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

  // Unit -> station alerts created in the range, under the line stored on the
  // alert (tbl_alerta.id_linea), like the central alerts view. Counts come
  // from one grouped query; the detail lists the newest ALERTS_DETAIL_LIMIT.
  private async alertsReport(range: DateRange): Promise<ReportDocument> {
    const params = ["UNIDAD", "ESTACION", range.from, nextDay(range.to)];
    const where = `WHERE a.tipo_origen = $1 AND a.tipo_destino = $2
          AND a.fecha_creacion >= $3 AND a.fecha_creacion < $4`;
    const counts = (await this.dataSource.query(
      `SELECT a.tipo_alerta AS "type", a.estado_alerta AS "state",
              a.id_linea AS "lineId", l.numero_linea AS "lineNumber", l.nombre_linea AS "lineName",
              a.id_estacion_destino AS "stationId", es.nombre_estacion AS "stationName",
              COUNT(*) AS "total"
         FROM tbl_alerta a
         LEFT JOIN tbl_linea l ON l.id_linea = a.id_linea
         LEFT JOIN tbl_estacion es ON es.id_estacion = a.id_estacion_destino
        ${where}
        GROUP BY a.tipo_alerta, a.estado_alerta, a.id_linea, l.numero_linea, l.nombre_linea,
                 a.id_estacion_destino, es.nombre_estacion`,
      params,
    )) as AlertCountRow[];
    const detail = (await this.dataSource.query(
      `SELECT to_char(a.fecha_creacion, 'YYYY-MM-DD HH24:MI') AS "createdAt",
              a.tipo_alerta AS "type", a.estado_alerta AS "state",
              l.numero_linea AS "lineNumber", l.nombre_linea AS "lineName",
              es.nombre_estacion AS "stationName", u.numero_placa AS "plate", e.nombre_emple AS "pilotName"
         FROM tbl_alerta a
         LEFT JOIN tbl_linea l ON l.id_linea = a.id_linea
         LEFT JOIN tbl_estacion es ON es.id_estacion = a.id_estacion_destino
         LEFT JOIN tbl_unidad u ON u.id_unidad = a.id_unidad
         LEFT JOIN tbl_empleado e ON e.id_emple = a.id_empleado
        ${where}
        ORDER BY a.fecha_creacion DESC, a.id_alerta DESC
        LIMIT ${ALERTS_DETAIL_LIMIT}`,
      params,
    )) as AlertDetailRow[];

    const sum = (rows: AlertCountRow[]) => rows.reduce((total, row) => total + Number(row.total), 0);
    const total = sum(counts);
    const states = orderedValues(ALERT_STATE_ORDER, counts.map((row) => row.state));
    const types = orderedValues(ALERT_TYPE_ORDER, counts.map((row) => row.type));
    const lineLabel = (number: string | null, name: string | null) =>
      number === null ? NO_LINE : `${number} - ${name}`;

    // One row per (stored line, destination station).
    const stations = new Map<string, AlertCountRow[]>();
    for (const row of counts) {
      const key = `${row.lineId ?? ""}|${row.stationId ?? ""}`;
      stations.set(key, [...(stations.get(key) ?? []), row]);
    }
    const byText = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
    const stationGroups = [...stations.values()].sort(([a], [b]) => {
      if (a!.lineNumber !== b!.lineNumber) {
        if (a!.lineNumber === null) return 1;
        if (b!.lineNumber === null) return -1;
        return byText(a!.lineNumber, b!.lineNumber);
      }
      return byText(a!.stationName ?? "", b!.stationName ?? "");
    });

    return {
      title: "Reporte de alertas operativas",
      subtitle: `Del ${range.from} al ${range.to}`,
      summary: [
        ["Total de alertas", String(total)],
        ...states.map((state): [string, string] => [
          label(ALERT_STATE_LABELS, state),
          String(sum(counts.filter((row) => row.state === state))),
        ]),
      ],
      sections: [
        {
          heading: "Alertas por tipo",
          columns: ["Tipo", "Cantidad"],
          rows: types.map((type) => [
            label(ALERT_TYPE_LABELS, type),
            String(sum(counts.filter((row) => row.type === type))),
          ]),
        },
        {
          heading: "Alertas por línea y estación",
          columns: ["Línea", "Estación", "Total", "Pendientes", "Resueltas"],
          rows: stationGroups.map((rows) => [
            lineLabel(rows[0]!.lineNumber, rows[0]!.lineName),
            rows[0]!.stationName ?? "-",
            String(sum(rows)),
            String(sum(rows.filter((row) => row.state === "PENDIENTE"))),
            String(sum(rows.filter((row) => row.state === "RESUELTA"))),
          ]),
          emptyMessage: NO_ALERTS,
        },
        {
          heading: "Detalle de alertas",
          ...(total > detail.length
            ? { note: `Se muestran las ${detail.length} alertas más recientes de ${total}.` }
            : {}),
          columns: ["Fecha", "Tipo", "Línea", "Estación", "Unidad", "Piloto", "Estado"],
          rows: detail.map((row) => [
            row.createdAt,
            label(ALERT_TYPE_LABELS, row.type),
            lineLabel(row.lineNumber, row.lineName),
            row.stationName ?? "-",
            row.plate ?? "-",
            row.pilotName ?? "-",
            label(ALERT_STATE_LABELS, row.state),
          ]),
          emptyMessage: NO_ALERTS,
        },
      ],
    };
  }

  // QPayPro recharge transactions started in the range (tbl_transaccion_pago),
  // in every state. Counts and amounts come from one grouped query; the detail
  // lists the newest PAYMENTS_DETAIL_LIMIT.
  private async paymentsReport(range: DateRange): Promise<ReportDocument> {
    const params = [range.from, nextDay(range.to)];
    const where = "WHERE t.fecha_transaccion >= $1 AND t.fecha_transaccion < $2";
    const counts = (await this.dataSource.query(
      `SELECT t.estado_pago AS "state", COUNT(*) AS "total", COALESCE(SUM(t.monto_pago), 0) AS "amount"
         FROM tbl_transaccion_pago t ${where}
        GROUP BY t.estado_pago`,
      params,
    )) as PaymentCountRow[];
    const detail = (await this.dataSource.query(
      `SELECT to_char(t.fecha_transaccion, 'YYYY-MM-DD HH24:MI') AS "createdAt",
              t.referencia_pago AS "reference", tc.numero_tarjeta AS "cardNumber",
              t.monto_pago AS "amount", t.estado_pago AS "state", t.numero_autorizacion AS "authorization"
         FROM tbl_transaccion_pago t
         JOIN tbl_tarjeta_ciudadana tc ON tc.id_tarjeta_ciudadana = t.id_tarjeta_ciudadana
        ${where}
        ORDER BY t.fecha_transaccion DESC, t.id_transaccion_pago DESC
        LIMIT ${PAYMENTS_DETAIL_LIMIT}`,
      params,
    )) as PaymentDetailRow[];

    const total = counts.reduce((sum, row) => sum + Number(row.total), 0);
    const ofState = (state: string) => counts.find((row) => row.state === state);
    const states = orderedValues(PAYMENT_STATE_ORDER, counts.map((row) => row.state));

    return {
      title: "Reporte de pagos",
      subtitle: `Del ${range.from} al ${range.to}`,
      summary: [
        ["Total de transacciones", String(total)],
        ["Monto aprobado", money(ofState("APROBADA")?.amount ?? 0)],
      ],
      sections: [
        {
          heading: "Pagos por estado",
          columns: ["Estado", "Cantidad", "Monto"],
          rows: states.map((state) => [
            label(PAYMENT_STATE_LABELS, state),
            String(Number(ofState(state)?.total ?? 0)),
            money(ofState(state)?.amount ?? 0),
          ]),
        },
        {
          heading: "Detalle de pagos",
          ...(total > detail.length
            ? { note: `Se muestran los ${detail.length} pagos más recientes de ${total}.` }
            : {}),
          columns: ["Fecha", "Referencia", "Tarjeta", "Monto", "Estado", "Autorización"],
          rows: detail.map((row) => [
            row.createdAt,
            row.reference,
            row.cardNumber,
            money(row.amount),
            label(PAYMENT_STATE_LABELS, row.state),
            row.authorization ?? "-",
          ]),
          emptyMessage: NO_PAYMENTS,
        },
      ],
    };
  }

  // Pilot stop reports (tbl_parada_unidad) made in the range, per unit. The
  // report row stores no line, so the line is the unit's current assignment
  // and the stop order is the stop's position on that line. Totals come from
  // one grouped query; the detail holds the newest TRIPS_DETAIL_LIMIT reports,
  // printed oldest first under each unit.
  private async unitTripsReport(range: DateRange): Promise<ReportDocument> {
    const params = [range.from, nextDay(range.to)];
    const where = "WHERE pu.fecha_reporte >= $1 AND pu.fecha_reporte < $2";
    const units = (await this.dataSource.query(
      `SELECT u.id_unidad AS "unitId", u.numero_placa AS "plate",
              l.numero_linea AS "lineNumber", l.nombre_linea AS "lineName",
              COUNT(*) AS "stops", COALESCE(SUM(pu.subieron), 0) AS "boarded",
              COALESCE(SUM(pu.bajaron), 0) AS "alighted"
         FROM tbl_parada_unidad pu
         JOIN tbl_unidad u ON u.id_unidad = pu.id_unidad
         LEFT JOIN tbl_asignacion_unidad au ON au.id_unidad = u.id_unidad
         LEFT JOIN tbl_linea l ON l.id_linea = au.id_linea
        ${where}
        GROUP BY u.id_unidad, u.numero_placa, l.numero_linea, l.nombre_linea
        ORDER BY u.numero_placa`,
      params,
    )) as UnitTripCountRow[];
    const detail = (await this.dataSource.query(
      `SELECT pu.id_unidad AS "unitId", to_char(pu.fecha_reporte, 'YYYY-MM-DD HH24:MI') AS "reportedAt",
              lp.orden AS "order", p.nombre_parada AS "stopName", es.nombre_estacion AS "stationName",
              pu.subieron AS "boarded", pu.bajaron AS "alighted", pu.ocupacion_resultante AS "occupancy",
              e.nombre_emple AS "pilotName"
         FROM tbl_parada_unidad pu
         JOIN tbl_parada p ON p.id_parada = pu.id_parada
         LEFT JOIN tbl_estacion es ON es.id_parada = p.id_parada
         LEFT JOIN tbl_asignacion_unidad au ON au.id_unidad = pu.id_unidad
         LEFT JOIN tbl_linea_parada lp ON lp.id_linea = au.id_linea AND lp.id_parada = pu.id_parada
         LEFT JOIN tbl_empleado e ON e.id_emple = pu.id_empleado
        ${where}
        ORDER BY pu.fecha_reporte DESC, pu.id_parada_unidad DESC
        LIMIT ${TRIPS_DETAIL_LIMIT}`,
      params,
    )) as UnitTripStopRow[];

    const sum = (field: "stops" | "boarded" | "alighted") =>
      units.reduce((total, row) => total + Number(row[field]), 0);
    const totalStops = sum("stops");
    const lineLabel = (row: UnitTripCountRow) =>
      row.lineNumber === null ? NO_LINE : `${row.lineNumber} - ${row.lineName}`;
    const truncated =
      totalStops > detail.length
        ? ` El detalle muestra los ${detail.length} reportes de parada más recientes de ${totalStops}.`
        : "";

    return {
      title: "Reporte de viajes por unidad",
      subtitle: `Del ${range.from} al ${range.to}`,
      summary: [
        ["Unidades con viajes", String(units.length)],
        ["Paradas registradas", String(totalStops)],
        ["Pasajeros que subieron", String(sum("boarded"))],
        ["Pasajeros que bajaron", String(sum("alighted"))],
      ],
      sections: [
        {
          heading: "Viajes por unidad",
          note: `${TRIPS_LINE_NOTE}${truncated}`,
          columns: ["Unidad", "Línea", "Paradas", "Subieron", "Bajaron"],
          rows: units.map((row) => [
            row.plate,
            lineLabel(row),
            String(Number(row.stops)),
            String(Number(row.boarded)),
            String(Number(row.alighted)),
          ]),
          emptyMessage: "No hay viajes registrados en el rango.",
        },
        ...units.map((unit) => {
          const stops = Number(unit.stops);
          const line = unit.lineNumber === null ? NO_LINE : `Línea ${lineLabel(unit)}`;
          return {
            heading: `Unidad ${unit.plate} - ${line} (${stops} ${stops === 1 ? "parada" : "paradas"})`,
            columns: ["Fecha", "Orden", "Parada", "Estación", "Subieron", "Bajaron", "Ocupación", "Piloto"],
            rows: detail
              .filter((row) => String(row.unitId) === String(unit.unitId))
              .reverse()
              .map((row) => [
                row.reportedAt,
                row.order === null ? "-" : String(row.order),
                row.stopName,
                row.stationName ?? "-",
                String(row.boarded),
                String(row.alighted),
                String(row.occupancy),
                row.pilotName ?? "-",
              ]),
            emptyMessage: "Sus reportes quedan fuera del detalle mostrado.",
          };
        }),
      ],
    };
  }
}

/** Quetzal amount with two decimals, e.g. "Q 150.50". */
function money(amount: string | number): string {
  return `Q ${Number(amount).toFixed(2)}`;
}

/** Fixed order first; any unexpected stored value is appended so nothing is lost. */
function orderedValues(order: readonly string[], values: string[]): string[] {
  return [...order, ...values].filter((value, index, all) => all.indexOf(value) === index);
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
