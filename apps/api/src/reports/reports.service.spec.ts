import { jest } from "@jest/globals";

import { AUDIT_RESULTS } from "../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../authentication/entities/employee.entity.js";
import type { AuditRepository } from "../authentication/infrastructure/audit.repository.js";
import { ValidationError } from "../shared/errors/domain-exception.filter.js";
import type { PdfRenderer } from "./pdf/pdf-renderer.js";
import type { ReportDocument } from "./reports.contracts.js";
import { ReportsService } from "./reports.service.js";

type QueryMock = jest.Mock<(sql: string, params?: unknown[]) => Promise<unknown[]>>;

const ACTOR = { employeeId: "7" };
const ACTOR_ENTITY = { id: "7", name: "Ana Admin", email: "ana@transmetro.gt" } as EmployeeEntity;
const PDF = Buffer.from("%PDF-fake");

describe("ReportsService", () => {
  let query: QueryMock;
  let findOneOrFail: jest.Mock<(...args: any[]) => Promise<unknown>>;
  let auditCreate: jest.Mock<(...args: any[]) => Promise<unknown>>;
  let render: jest.Mock<(doc: ReportDocument, meta: unknown) => Promise<Buffer>>;
  let service: ReportsService;
  let tables: Record<string, unknown[]>;

  beforeEach(() => {
    tables = {};
    // Routes each SQL statement to its fixture by a distinctive fragment.
    query = jest.fn(async (sql: string) => {
      const key = Object.keys(tables).find((fragment) => sql.includes(fragment));
      return key ? tables[key]! : [];
    });
    findOneOrFail = jest.fn(async () => ACTOR_ENTITY);
    const manager = { getRepository: jest.fn(() => ({ findOneOrFail })) };
    const dataSource = { query, manager };
    auditCreate = jest.fn(async () => ({}));
    render = jest.fn(async () => PDF);
    service = new ReportsService(
      dataSource as never,
      { create: auditCreate } as unknown as AuditRepository,
      { render } as unknown as PdfRenderer,
    );
  });

  const renderedDocument = (): ReportDocument => render.mock.calls[0]![0];

  describe("fleet report (S4a)", () => {
    beforeEach(() => {
      tables["FROM tbl_unidad"] = [
        { plate: "P-002", brand: "Volvo", model: "B12", year: 2020, capacity: 80, status: "EN_SERVICIO", lineNumber: "12", lineName: "Centra Sur", pilotName: "Luis Piloto" },
        { plate: "P-001", brand: "Scania", model: "K", year: 2019, capacity: 90, status: "DISPONIBLE", lineNumber: null, lineName: null, pilotName: null },
        { plate: "P-003", brand: "Volvo", model: "B9", year: 2018, capacity: 70, status: "EN_SERVICIO", lineNumber: "1", lineName: "Ruta 1", pilotName: null },
      ];
    });

    it("groups units by state in a fixed order, with line and pilot, and counts per state", async () => {
      await service.export("fleet", ACTOR);
      const doc = renderedDocument();

      expect(doc.title).toBe("Reporte de flota");
      expect(doc.summary).toEqual([
        ["Total de unidades", "3"],
        ["Disponible", "1"],
        ["En servicio", "2"],
        ["En mantenimiento", "0"],
        ["Fuera de servicio", "0"],
      ]);
      expect(doc.sections.map((s) => s.heading)).toEqual([
        "Disponible (1)",
        "En servicio (2)",
        "En mantenimiento (0)",
        "Fuera de servicio (0)",
      ]);
      expect(doc.sections[0]!.columns).toEqual(["Placa", "Marca / modelo", "Año", "Capacidad", "Línea", "Piloto"]);
      expect(doc.sections[0]!.rows).toEqual([["P-001", "Scania K", "2019", "90", "Sin asignar", "Sin asignar"]]);
      expect(doc.sections[1]!.rows).toEqual([
        ["P-002", "Volvo B12", "2020", "80", "12 - Centra Sur", "Luis Piloto"],
        ["P-003", "Volvo B9", "2018", "70", "1 - Ruta 1", "Sin asignar"],
      ]);
      expect(doc.sections[2]!.rows).toEqual([]);
      expect(doc.sections[2]!.emptyMessage).toBe("Sin unidades en este estado.");
    });
  });

  describe("personnel report (S4b)", () => {
    it("groups employees by role with their state and counts active/inactive", async () => {
      tables["FROM tbl_empleado e JOIN tbl_rol"] = [
        { name: "Ana", email: "ana@t.gt", status: "ACTIVO", roleName: "Administrador del sistema" },
        { name: "Beto", email: "beto@t.gt", status: "INACTIVO", roleName: "Piloto" },
        { name: "Carla", email: "carla@t.gt", status: "ACTIVO", roleName: "Piloto" },
      ];

      await service.export("personnel", ACTOR);
      const doc = renderedDocument();

      expect(doc.title).toBe("Reporte de personal");
      expect(doc.summary).toEqual([
        ["Total de empleados", "3"],
        ["Activos", "2"],
        ["Inactivos", "1"],
      ]);
      expect(doc.sections.map((s) => s.heading)).toEqual(["Administrador del sistema (1)", "Piloto (2)"]);
      expect(doc.sections[1]!.columns).toEqual(["Nombre", "Correo", "Estado"]);
      expect(doc.sections[1]!.rows).toEqual([
        ["Beto", "beto@t.gt", "Inactivo"],
        ["Carla", "carla@t.gt", "Activo"],
      ]);
    });
  });

  describe("infrastructure report (S4c)", () => {
    it("lists each line with its municipalities and ordered stops, marking stations", async () => {
      tables["FROM tbl_linea l"] = [
        { id: "1", number: "1", name: "Ruta 1", status: "ACTIVA", routeType: "CIRCULAR", municipalities: "Guatemala, Mixco" },
        { id: "2", number: "2", name: "Ruta 2", status: "INACTIVA", routeType: "LINEAL", municipalities: "" },
      ];
      tables["FROM tbl_linea_parada lp"] = [
        { lineId: "1", order: 1, stopName: "Plaza", stopStatus: "ACTIVA", stationName: "Estación Plaza" },
        { lineId: "1", order: 2, stopName: "Trébol", stopStatus: "MANTENIMIENTO", stationName: null },
      ];

      await service.export("infrastructure", ACTOR);
      const doc = renderedDocument();

      expect(doc.title).toBe("Reporte de infraestructura");
      expect(doc.summary).toEqual([
        ["Total de líneas", "2"],
        ["Líneas activas", "1"],
        ["Paradas asignadas", "2"],
        ["Estaciones", "1"],
      ]);
      expect(doc.sections[0]!.heading).toBe("Línea 1 - Ruta 1 (Activa, Circular)");
      expect(doc.sections[0]!.note).toBe("Municipios: Guatemala, Mixco");
      expect(doc.sections[0]!.columns).toEqual(["Orden", "Parada", "Estación", "Estado"]);
      expect(doc.sections[0]!.rows).toEqual([
        ["1", "Plaza", "Estación Plaza", "Activa"],
        ["2", "Trébol", "-", "Mantenimiento"],
      ]);
      expect(doc.sections[1]!.heading).toBe("Línea 2 - Ruta 2 (Inactiva, Lineal)");
      expect(doc.sections[1]!.note).toBe("Municipios: Sin municipios asignados");
      expect(doc.sections[1]!.emptyMessage).toBe("La línea no tiene paradas asignadas.");
    });
  });

  describe("audit summary report (S4d, S6)", () => {
    it("summarizes actions per module and per user within the inclusive date range", async () => {
      tables["GROUP BY b.modulo"] = [
        { module: "fleet", action: "assign_pilot", result: "EXITOSO", total: "3" },
        { module: "auth", action: "LOGIN", result: "FALLIDO", total: "1" },
      ];
      tables["GROUP BY e.id_emple"] = [{ name: "Ana", email: "ana@t.gt", total: "4" }];

      await service.export("audit-log", ACTOR, { from: "2026-01-01", to: "2026-01-31" });
      const doc = renderedDocument();

      expect(doc.title).toBe("Resumen de bitácora");
      expect(doc.subtitle).toBe("Del 2026-01-01 al 2026-01-31");
      expect(doc.summary).toEqual([
        ["Total de acciones", "4"],
        ["Usuarios con actividad", "1"],
      ]);
      expect(doc.sections[0]!.heading).toBe("Acciones por módulo");
      expect(doc.sections[0]!.rows).toEqual([
        ["fleet", "assign_pilot", "Exitoso", "3"],
        ["auth", "LOGIN", "Fallido", "1"],
      ]);
      expect(doc.sections[1]!.heading).toBe("Acciones por usuario");
      expect(doc.sections[1]!.rows).toEqual([["Ana", "ana@t.gt", "4"]]);

      // Date-only upper bound covers the whole day: strictly before the next one.
      for (const call of query.mock.calls) {
        expect(call[1]).toEqual(["2026-01-01", "2026-02-01"]);
      }
    });

    it("rejects a range whose start is after its end, without querying, rendering or auditing", async () => {
      await expect(
        service.export("audit-log", ACTOR, { from: "2026-02-01", to: "2026-01-31" }),
      ).rejects.toThrow(new ValidationError("La fecha inicial no puede ser posterior a la fecha final."));
      expect(query).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it("requires a range", async () => {
      await expect(service.export("audit-log", ACTOR)).rejects.toBeInstanceOf(ValidationError);
      expect(auditCreate).not.toHaveBeenCalled();
    });
  });

  describe("alerts report (alerts S5)", () => {
    const RANGE = { from: "2026-01-01", to: "2026-01-31" };
    const agg = (
      type: string,
      state: string,
      line: [string, string, string] | null,
      stationId: string,
      stationName: string,
      total: string,
    ) => ({
      type,
      state,
      lineId: line?.[0] ?? null,
      lineNumber: line?.[1] ?? null,
      lineName: line?.[2] ?? null,
      stationId,
      stationName,
      total,
    });
    const L12: [string, string, string] = ["3", "12", "Centra Sur"];
    const L2: [string, string, string] = ["1", "2", "Ruta 2"];

    beforeEach(() => {
      tables["GROUP BY a.tipo_alerta"] = [
        agg("ACCIDENTE", "PENDIENTE", L12, "22", "Estación Centro", "2"),
        agg("RETRASO", "RESUELTA", L12, "21", "Estación Norte", "1"),
        agg("ACCIDENTE", "RECIBIDA", L2, "22", "Estación Centro", "1"),
        agg("FALLA_MECANICA", "EN_ATENCION", null, "23", "Estación Sur", "1"),
      ];
      tables["ORDER BY a.fecha_creacion DESC"] = [
        { createdAt: "2026-01-20 10:30", type: "ACCIDENTE", state: "PENDIENTE", lineNumber: "12", lineName: "Centra Sur", stationName: "Estación Centro", plate: "P-001", pilotName: "Luis Piloto" },
        { createdAt: "2026-01-02 08:00", type: "FALLA_MECANICA", state: "EN_ATENCION", lineNumber: null, lineName: null, stationName: "Estación Sur", plate: null, pilotName: "Beto" },
      ];
    });

    it("summarizes per state, per type and per line and station, and lists the alerts of the range", async () => {
      await service.export("alerts", ACTOR, RANGE);
      const doc = renderedDocument();

      expect(doc.title).toBe("Reporte de alertas operativas");
      expect(doc.subtitle).toBe("Del 2026-01-01 al 2026-01-31");
      expect(doc.summary).toEqual([
        ["Total de alertas", "5"],
        ["Pendiente", "2"],
        ["Recibida", "1"],
        ["En atención", "1"],
        ["Resuelta", "1"],
      ]);
      expect(doc.sections.map((section) => section.heading)).toEqual([
        "Alertas por tipo",
        "Alertas por línea y estación",
        "Detalle de alertas",
      ]);
      const [byType, byStation, detail] = doc.sections as [
        (typeof doc.sections)[number],
        (typeof doc.sections)[number],
        (typeof doc.sections)[number],
      ];
      expect(byType.columns).toEqual(["Tipo", "Cantidad"]);
      expect(byType.rows).toEqual([
        ["Accidente", "3"],
        ["Falla mecánica", "1"],
        ["Emergencia médica", "0"],
        ["Incidente de seguridad", "0"],
        ["Retraso", "1"],
        ["Unidad llena", "0"],
      ]);
      expect(byStation.columns).toEqual(["Línea", "Estación", "Total", "Pendientes", "Resueltas"]);
      // Lines by number ("2" before "12"), stations by name, "Sin línea" last.
      expect(byStation.rows).toEqual([
        ["2 - Ruta 2", "Estación Centro", "1", "0", "0"],
        ["12 - Centra Sur", "Estación Centro", "2", "2", "0"],
        ["12 - Centra Sur", "Estación Norte", "1", "0", "1"],
        ["Sin línea", "Estación Sur", "1", "0", "0"],
      ]);
      expect(detail.columns).toEqual(["Fecha", "Tipo", "Línea", "Estación", "Unidad", "Piloto", "Estado"]);
      expect(detail.rows).toEqual([
        ["2026-01-20 10:30", "Accidente", "12 - Centra Sur", "Estación Centro", "P-001", "Luis Piloto", "Pendiente"],
        ["2026-01-02 08:00", "Falla mecánica", "Sin línea", "Estación Sur", "-", "Beto", "En atención"],
      ]);
    });

    it("queries only unit->station alerts created inside the inclusive range, detail newest first, max 500", async () => {
      await service.export("alerts", ACTOR, RANGE);

      expect(query).toHaveBeenCalledTimes(2);
      for (const [sql, params] of query.mock.calls) {
        expect(sql).toContain("a.fecha_creacion >= $3 AND a.fecha_creacion < $4");
        expect(params).toEqual(["UNIDAD", "ESTACION", "2026-01-01", "2026-02-01"]);
      }
      const detailSql = query.mock.calls.find(([sql]) => sql.includes("ORDER BY a.fecha_creacion DESC"))![0];
      expect(detailSql).toContain("LIMIT 500");
      expect(detailSql).toContain("a.id_linea");
    });

    it("notes how many alerts the detail shows when the range has more", async () => {
      tables["GROUP BY a.tipo_alerta"] = [agg("RETRASO", "PENDIENTE", L12, "21", "Estación Norte", "501")];

      await service.export("alerts", ACTOR, RANGE);

      expect(renderedDocument().sections[2]!.note).toBe("Se muestran las 2 alertas más recientes de 501.");
    });

    it("prints empty messages when the range has no alerts", async () => {
      tables = {};

      await service.export("alerts", ACTOR, RANGE);
      const doc = renderedDocument();

      expect(doc.summary[0]).toEqual(["Total de alertas", "0"]);
      expect(doc.sections[1]!.rows).toEqual([]);
      expect(doc.sections[1]!.emptyMessage).toBe("No hay alertas en el rango.");
      expect(doc.sections[2]!.emptyMessage).toBe("No hay alertas en el rango.");
      expect(doc.sections[2]!.note).toBeUndefined();
    });

    it("rejects a missing or inverted range without querying, rendering or auditing", async () => {
      await expect(service.export("alerts", ACTOR)).rejects.toBeInstanceOf(ValidationError);
      await expect(
        service.export("alerts", ACTOR, { from: "2026-02-01", to: "2026-01-31" }),
      ).rejects.toThrow(new ValidationError("La fecha inicial no puede ser posterior a la fecha final."));
      expect(query).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it("names the file after its range and audits the export with the range", async () => {
      const result = await service.export("alerts", ACTOR, RANGE);

      expect(result.fileName).toBe("reporte-alertas-2026-01-01_2026-01-31.pdf");
      expect(auditCreate).toHaveBeenCalledTimes(1);
      expect(auditCreate.mock.calls[0]![1]).toMatchObject({
        action: "export_report",
        module: "reports",
        detalle: { report: "alerts", from: "2026-01-01", to: "2026-01-31" },
      });
    });
  });

  describe("export result and audit trail (S3, S5)", () => {
    it("returns the rendered PDF with a dated file name and passes the actor to the renderer", async () => {
      const result = await service.export("fleet", ACTOR);

      expect(result.content).toBe(PDF);
      expect(result.fileName).toMatch(/^reporte-flota-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(render.mock.calls[0]![1]).toMatchObject({ generatedBy: "Ana Admin" });
    });

    it.each([
      ["personnel", /^reporte-personal-\d{4}-\d{2}-\d{2}\.pdf$/],
      ["infrastructure", /^reporte-infraestructura-\d{4}-\d{2}-\d{2}\.pdf$/],
    ] as const)("names the %s file", async (type, pattern) => {
      expect((await service.export(type, ACTOR)).fileName).toMatch(pattern);
    });

    it("names the audit summary file after its range", async () => {
      const result = await service.export("audit-log", ACTOR, { from: "2026-01-01", to: "2026-01-31" });
      expect(result.fileName).toBe("reporte-bitacora-2026-01-01_2026-01-31.pdf");
    });

    it("writes one export_report audit row for the actor after rendering", async () => {
      await service.export("audit-log", ACTOR, { from: "2026-01-01", to: "2026-01-31" });

      expect(findOneOrFail).toHaveBeenCalledWith({ where: { id: "7" } });
      expect(auditCreate).toHaveBeenCalledTimes(1);
      expect(auditCreate.mock.calls[0]![1]).toEqual({
        action: "export_report",
        employee: ACTOR_ENTITY,
        entityId: "7",
        entityType: "report",
        module: "reports",
        result: AUDIT_RESULTS.SUCCESS,
        detalle: { report: "audit-log", from: "2026-01-01", to: "2026-01-31" },
      });
    });

    it("does not audit when rendering fails", async () => {
      render.mockRejectedValueOnce(new Error("boom"));
      await expect(service.export("fleet", ACTOR)).rejects.toThrow("boom");
      expect(auditCreate).not.toHaveBeenCalled();
    });
  });
});
