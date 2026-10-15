// ============================================================================
// E2E HTTP contract for the administrative PDF reports (task T2,
// odd/tasks/administrative-reports.md).
//
// Full AppModule against real Postgres, like audit-log.e2e-spec.ts. The unit
// specs of ReportsService mock dataSource.query, so only this suite proves the
// SQL: joins, grouping, string_agg, the inclusive date-only range and the
// export_report audit row. The real PdfRenderer still produces every PDF; a
// spy around it keeps the ReportDocument it received so the data can be
// asserted without parsing compressed PDF streams.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Every seeded
// row carries a tag unique to this run and is removed in afterAll.
// ============================================================================

process.env.ADMIN_WEB_ORIGINS ??= "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID ??= "test-client-id";

import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module.js";
import { PdfRenderer } from "../src/reports/pdf/pdf-renderer.js";
import type { ReportDocument, ReportMeta } from "../src/reports/reports.contracts.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";
const REPORTES = "REPORTES_ADMINISTRATIVOS_CONSULTAR";
const AUDITORIA = "AUDITORIA_BITACORA_CONSULTAR";

class SpyRenderer extends PdfRenderer {
  last: ReportDocument | null = null;
  override render(report: ReportDocument, meta: ReportMeta): Promise<Buffer> {
    this.last = report;
    return super.render(report, meta);
  }
}

function signToken(employeeId: string, roleCode: string, permissions: string[]): string {
  return jwt.sign(
    {
      employeeId,
      email: `e2e-rep-${employeeId}@transmetro.gt`,
      roles: [roleCode],
      permissions,
      scope: { role: roleCode, modules: [] },
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

// Supertest buffers application/pdf as binary only with an explicit parser.
function binary(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("Administrative reports /reports (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const renderer = new SpyRenderer();

  const stamp = String(Date.now()).slice(-8);
  const runTag = `E2E-REP-${stamp}`;
  const plate = `E2E${stamp}`;
  const lineNumber = `E${stamp}`;
  const employeeIds: string[] = [];
  const ids: Record<string, string> = {};

  let reporterId: string; // REPORTES only
  let auditorId: string; // AUDITORIA only
  let reporterToken: string;
  let auditorToken: string;
  let noPermissionToken: string;

  async function one<T = Record<string, string>>(sql: string, params: unknown[] = []): Promise<T> {
    return ((await dataSource.query(sql, params)) as T[])[0]!;
  }

  async function seedEmployee(name: string, roleCode: string): Promise<string> {
    const { id } = await one(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       SELECT $1, 'ACTIVO', $2, id_rol FROM tbl_rol WHERE codigo = $3
       RETURNING id_emple AS "id"`,
      [name, `${runTag}-${employeeIds.length}@transmetro.gt`.toLowerCase(), roleCode],
    );
    employeeIds.push(String(id));
    return String(id);
  }

  const auditRows = (employeeId: string) =>
    dataSource.query(
      `SELECT modulo AS "module", accion AS "action", entidad_tipo AS "entityType", resultado AS "result", detalle
         FROM tbl_bitacora WHERE id_empleado = $1 AND modulo = 'reports' ORDER BY id_bitacora`,
      [employeeId],
    ) as Promise<Array<{ module: string; action: string; entityType: string; result: string; detalle: Record<string, unknown> }>>;

  function download(path: string, token?: string) {
    const req = request(app.getHttpServer()).get(path).buffer(true).parse(binary);
    return token ? req.set("Authorization", `Bearer ${token}`) : req;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PdfRenderer)
      .useValue(renderer)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    reporterId = await seedEmployee(`${runTag} Reporter`, "OPERADOR_CENTRAL");
    auditorId = await seedEmployee(`${runTag} Auditor`, "OPERADOR_CENTRAL");
    const pilotId = await seedEmployee(`${runTag} Piloto`, "PILOTO");
    reporterToken = signToken(reporterId, "OPERADOR_CENTRAL", [REPORTES]);
    auditorToken = signToken(auditorId, "OPERADOR_CENTRAL", [AUDITORIA]);
    noPermissionToken = signToken(pilotId, "PILOTO", ["UNIDAD_ASIGNADA_CONSULTAR"]);

    ids.municipality = (await one(
      `INSERT INTO tbl_municipalidad (nombre_municipalidad, departamento) VALUES ($1, 'Guatemala') RETURNING id_municipalidad AS "id"`,
      [`${runTag} Mixco`],
    )).id!;
    ids.line = (await one(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido)
       VALUES ($1, $2, '#123456', 'ACTIVA', 'LINEAL') RETURNING id_linea AS "id"`,
      [lineNumber, `${runTag} Línea`],
    )).id!;
    await dataSource.query(`INSERT INTO tbl_linea_municipalidad (id_linea, id_municipalidad) VALUES ($1, $2)`, [ids.line, ids.municipality]);
    ids.stopA = (await one(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada) VALUES ($1, 14.6, -90.5, 'ACTIVA') RETURNING id_parada AS "id"`,
      [`${runTag} Parada A`],
    )).id!;
    ids.stopB = (await one(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada) VALUES ($1, 14.61, -90.51, 'MANTENIMIENTO') RETURNING id_parada AS "id"`,
      [`${runTag} Parada B`],
    )).id!;
    ids.station = (await one(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA', $2) RETURNING id_estacion AS "id"`,
      [`${runTag} Estación`, ids.stopA],
    )).id!;
    // Inserted out of order: the report must list stops by "orden".
    await dataSource.query(
      `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea) VALUES (2, 0, $1, $3), (1, 5, $2, $3)`,
      [ids.stopB, ids.stopA, ids.line],
    );
    ids.unit = (await one(
      `INSERT INTO tbl_unidad (numero_placa, marca, modelo, anio, capacidad_pasajeros, estado_unidad)
       VALUES ($1, 'Volvo', 'B12', 2020, 80, 'EN_SERVICIO') RETURNING id_unidad AS "id"`,
      [plate],
    )).id!;
    await dataSource.query(`INSERT INTO tbl_asignacion_unidad (fecha_asignacion, id_unidad, id_linea) VALUES (now(), $1, $2)`, [ids.unit, ids.line]);
    await dataSource.query(`INSERT INTO tbl_asignacion_piloto (fecha_asignacion, id_empleado, id_unidad) VALUES (now(), $1, $2)`, [pilotId, ids.unit]);

    // Audit rows in a far-past window no other suite uses; the last one is
    // just after the window and must be excluded.
    const seedAudit = (when: string, action: string, result: string) =>
      dataSource.query(
        `INSERT INTO tbl_bitacora (fecha_hora, modulo, accion, entidad_tipo, entidad_id, resultado, id_empleado)
         VALUES ($1::timestamp, $2, $3, 'e2e', 1, $4, $5)`,
        [when, runTag.toLowerCase(), action, result, auditorId],
      );
    await seedAudit("1999-05-10 08:00:00", "create_e2e", "EXITOSO");
    await seedAudit("1999-05-11 23:30:00", "create_e2e", "EXITOSO");
    await seedAudit("1999-05-11 12:00:00", "update_e2e", "FALLIDO");
    await seedAudit("1999-05-12 00:00:00", "create_e2e", "EXITOSO");

    // Alerts in another far-past window; the last one is just after it. One
    // has no stored line (alert created before lines were stored).
    const seedAlert = (when: string, type: string, state: string, withLine: boolean) =>
      dataSource.query(
        `INSERT INTO tbl_alerta (fecha_creacion, fecha_actualizacion, tipo_alerta, tipo_origen, tipo_destino,
                                 estado_alerta, id_unidad, id_estacion_destino, id_empleado, id_linea)
         VALUES ($1::timestamp, $1::timestamp, $2, 'UNIDAD', 'ESTACION', $3, $4, $5, $6, $7)`,
        [when, type, state, ids.unit, ids.station, pilotId, withLine ? ids.line : null],
      );
    await seedAlert("1999-06-10 08:00:00", "ACCIDENTE", "PENDIENTE", true);
    await seedAlert("1999-06-11 23:30:00", "RETRASO", "RESUELTA", true);
    await seedAlert("1999-06-11 12:00:00", "FALLA_MECANICA", "RECIBIDA", false);
    await seedAlert("1999-06-12 00:00:00", "ACCIDENTE", "PENDIENTE", true);
  });

  afterAll(async () => {
    if (dataSource) {
      const q = (sql: string, params: unknown[]) => dataSource.query(sql, params).catch(() => undefined);
      await q(`DELETE FROM tbl_bitacora WHERE id_empleado = ANY($1::bigint[])`, [employeeIds]);
      await q(`DELETE FROM tbl_alerta WHERE id_unidad = $1`, [ids.unit]);
      await q(`DELETE FROM tbl_asignacion_piloto WHERE id_unidad = $1`, [ids.unit]);
      await q(`DELETE FROM tbl_asignacion_unidad WHERE id_unidad = $1`, [ids.unit]);
      await q(`DELETE FROM tbl_unidad WHERE id_unidad = $1`, [ids.unit]);
      await q(`DELETE FROM tbl_linea_parada WHERE id_linea = $1`, [ids.line]);
      await q(`DELETE FROM tbl_estacion WHERE id_estacion = $1`, [ids.station]);
      await q(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [[ids.stopA, ids.stopB]]);
      await q(`DELETE FROM tbl_linea_municipalidad WHERE id_linea = $1`, [ids.line]);
      await q(`DELETE FROM tbl_linea WHERE id_linea = $1`, [ids.line]);
      await q(`DELETE FROM tbl_municipalidad WHERE id_municipalidad = $1`, [ids.municipality]);
      await q(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [employeeIds]);
    }
    if (app) await app.close();
  });

  beforeEach(() => {
    renderer.last = null;
  });

  // --------------------------------------------------------------------------
  // Authorization (S5)
  // --------------------------------------------------------------------------
  it("seed grants both report permissions to OPERADOR_CENTRAL", async () => {
    const rows = (await dataSource.query(
      `SELECT p.codigo_permiso AS "code" FROM tbl_rol r
         JOIN tbl_rol_permiso rp ON rp.id_rol = r.id_rol
         JOIN tbl_permiso p ON p.id_permiso = rp.id_permiso
        WHERE r.codigo = 'OPERADOR_CENTRAL'`,
    )) as Array<{ code: string }>;
    expect(rows.map((r) => r.code)).toEqual(expect.arrayContaining([REPORTES, AUDITORIA]));
  });

  it.each([
    "/reports/fleet",
    "/reports/personnel",
    "/reports/infrastructure",
    "/reports/audit-log?from=1999-05-10&to=1999-05-11",
    "/reports/alerts?from=1999-06-10&to=1999-06-11",
  ])(
    "%s returns 401 without a token",
    async (path) => {
      await download(path).expect(401);
    },
  );

  it.each(["/reports/fleet", "/reports/personnel", "/reports/infrastructure", "/reports/alerts?from=1999-06-10&to=1999-06-11"])(
    "%s returns 403 without REPORTES_ADMINISTRATIVOS_CONSULTAR",
    async (path) => {
      await download(path, auditorToken).expect(403);
      await download(path, noPermissionToken).expect(403);
    },
  );

  it("/reports/audit-log returns 403 without AUDITORIA_BITACORA_CONSULTAR", async () => {
    await download("/reports/audit-log?from=1999-05-10&to=1999-05-11", reporterToken).expect(403);
  });

  // --------------------------------------------------------------------------
  // PDF downloads (S3, S4)
  // --------------------------------------------------------------------------
  it("fleet: downloads a PDF listing the unit under its state with its line and pilot", async () => {
    const res = await download("/reports/fleet", reporterToken).expect(200);

    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="reporte-flota-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect((res.body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const section = renderer.last!.sections.find((s) => s.heading.startsWith("En servicio"))!;
    expect(section.rows).toContainEqual([plate, "Volvo B12", "2020", "80", `${lineNumber} - ${runTag} Línea`, `${runTag} Piloto`]);
  });

  it("personnel: lists the seeded employees under their role", async () => {
    const res = await download("/reports/personnel", reporterToken).expect(200);
    expect(res.headers["content-disposition"]).toMatch(/filename="reporte-personal-/);

    const rows = renderer.last!.sections.flatMap((s) => s.rows);
    expect(rows).toContainEqual([`${runTag} Piloto`, `${runTag}-2@transmetro.gt`.toLowerCase(), "Activo"]);
  });

  it("infrastructure: lists the line with its municipality and stops in order, marking the station", async () => {
    const res = await download("/reports/infrastructure", reporterToken).expect(200);
    expect(res.headers["content-disposition"]).toMatch(/filename="reporte-infraestructura-/);

    const section = renderer.last!.sections.find((s) => s.heading.startsWith(`Línea ${lineNumber} `))!;
    expect(section.heading).toBe(`Línea ${lineNumber} - ${runTag} Línea (Activa, Lineal)`);
    expect(section.note).toBe(`Municipios: ${runTag} Mixco`);
    expect(section.rows).toEqual([
      ["1", `${runTag} Parada A`, `${runTag} Estación`, "Activa"],
      ["2", `${runTag} Parada B`, "-", "Mantenimiento"],
    ]);
  });

  it("audit-log: summarizes the inclusive date-only range (late-night row in, next-day row out)", async () => {
    const res = await download("/reports/audit-log?from=1999-05-10&to=1999-05-11", auditorToken).expect(200);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="reporte-bitacora-1999-05-10_1999-05-11.pdf"');

    const module = runTag.toLowerCase();
    const byAction = renderer.last!.sections[0]!.rows.filter((r) => r[0] === module);
    expect(byAction).toEqual([
      [module, "create_e2e", "Exitoso", "2"],
      [module, "update_e2e", "Fallido", "1"],
    ]);
    const byUser = renderer.last!.sections[1]!.rows.find((r) => r[0] === `${runTag} Auditor`);
    expect(byUser).toEqual([`${runTag} Auditor`, `${runTag}-1@transmetro.gt`.toLowerCase(), "3"]);
  });

  it("alerts: summarizes the inclusive range per state, type, line and station and lists each alert", async () => {
    const res = await download("/reports/alerts?from=1999-06-10&to=1999-06-11", reporterToken).expect(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="reporte-alertas-1999-06-10_1999-06-11.pdf"');
    expect((res.body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const doc = renderer.last!;
    expect(doc.title).toBe("Reporte de alertas operativas");
    expect(doc.summary).toEqual([
      ["Total de alertas", "3"],
      ["Pendiente", "1"],
      ["Recibida", "1"],
      ["En atención", "0"],
      ["Resuelta", "1"],
    ]);
    expect(doc.sections[0]!.rows.filter((r) => r[1] !== "0")).toEqual([
      ["Accidente", "1"],
      ["Falla mecánica", "1"],
      ["Retraso", "1"],
    ]);
    const lineLabel = `${lineNumber} - ${runTag} Línea`;
    const station = `${runTag} Estación`;
    expect(doc.sections[1]!.rows).toEqual([
      [lineLabel, station, "2", "1", "1"],
      ["Sin línea", station, "1", "0", "0"],
    ]);
    expect(doc.sections[2]!.rows).toEqual([
      ["1999-06-11 23:30", "Retraso", lineLabel, station, plate, `${runTag} Piloto`, "Resuelta"],
      ["1999-06-11 12:00", "Falla mecánica", "Sin línea", station, plate, `${runTag} Piloto`, "Recibida"],
      ["1999-06-10 08:00", "Accidente", lineLabel, station, plate, `${runTag} Piloto`, "Pendiente"],
    ]);
    expect(doc.sections[2]!.note).toBeUndefined();
  });

  it.each([
    "/reports/alerts",
    "/reports/alerts?from=1999-06-10",
    "/reports/alerts?from=1999-06-12&to=1999-06-11",
  ])("%s returns 400 and writes no audit row", async (path) => {
    const before = (await auditRows(reporterId)).length;
    await download(path, reporterToken).expect(400);
    expect(await auditRows(reporterId)).toHaveLength(before);
  });

  it("records the range of an alerts export", async () => {
    await download("/reports/alerts?from=1999-06-10&to=1999-06-11", reporterToken).expect(200);
    const rows = await auditRows(reporterId);
    expect(rows[rows.length - 1]!.detalle).toEqual({ report: "alerts", from: "1999-06-10", to: "1999-06-11" });
  });

  // --------------------------------------------------------------------------
  // Validation (S6) and audit trail (S5)
  // --------------------------------------------------------------------------
  it.each([
    "/reports/audit-log",
    "/reports/audit-log?from=1999-05-10",
    "/reports/audit-log?from=1999-13-01&to=1999-05-11",
    "/reports/audit-log?from=1999-05-12&to=1999-05-11",
  ])("%s returns 400 and writes no audit row", async (path) => {
    const before = (await auditRows(auditorId)).length;
    await download(path, auditorToken).expect(400);
    expect(await auditRows(auditorId)).toHaveLength(before);
  });

  it("records one export_report row per successful download", async () => {
    const before = (await auditRows(reporterId)).length;
    await download("/reports/personnel", reporterToken).expect(200);
    const rows = await auditRows(reporterId);

    expect(rows).toHaveLength(before + 1);
    expect(rows[rows.length - 1]).toEqual({
      module: "reports",
      action: "export_report",
      entityType: "report",
      result: "EXITOSO",
      detalle: { report: "personnel" },
    });
  });

  it("records the range of an audit summary export", async () => {
    await download("/reports/audit-log?from=1999-05-10&to=1999-05-11", auditorToken).expect(200);
    const rows = await auditRows(auditorId);
    expect(rows[rows.length - 1]!.detalle).toEqual({ report: "audit-log", from: "1999-05-10", to: "1999-05-11" });
  });
});
