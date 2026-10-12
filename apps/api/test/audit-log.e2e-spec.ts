// ============================================================================
// E2E HTTP contract for the read-only audit log routes (task A4,
// odd/tasks/audit-log-viewer.md).
//
// Same real-app-boot convention as personal.e2e-spec.ts: the full AppModule
// against real Postgres. The unit specs of AuditLogService mock
// dataSource.query, so only this suite proves the SQL itself: the JOIN with
// tbl_empleado, LIKE-wildcard escaping, the inclusive date-only upper bound
// resolved in the session time zone, COUNT/bigint typing, JSONB round-trip,
// and ordering + pagination over real rows.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test, so the
// development database is never touched. Requires apps/api/.env exported into
// the shell and database/init.sql applied to transmetro_test.
//
// Isolation: every audit row is seeded under a module name unique to this run
// and every query is scoped to it, so rows written by other suites or by real
// use never affect the assertions. Everything is removed in afterAll.
// ============================================================================

// Required before any import that reads process.env (see authentication.e2e-spec.ts).
process.env.ADMIN_WEB_ORIGINS ??= "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID ??= "test-client-id";

import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";

const AUDITORIA_BITACORA_CONSULTAR = "AUDITORIA_BITACORA_CONSULTAR";
const OPERATOR_ROLE_CODE = "OPERADOR_CENTRAL";
const PILOT_ROLE_CODE = "PILOTO";

interface AuditItemBody {
  id: string;
  createdAt: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  result: string;
  detalle: Record<string, unknown> | null;
  employee: { id: string; name: string; email: string };
}

interface AuditPageBody {
  items: AuditItemBody[];
  total: number;
  page: number;
  pageSize: number;
}

function signToken(employeeId: string, roleCode: string, permissions: string[]): string {
  return jwt.sign(
    {
      employeeId,
      email: `e2e-audit-${employeeId}@transmetro.gt`,
      roles: [roleCode],
      permissions,
      scope: { role: roleCode, modules: [] },
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

describe("Audit log /audit-log (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let operatorToken: string;
  let pilotToken: string;

  const runTag = `E2E-AUD-${Date.now()}`;
  // tbl_bitacora.modulo is VARCHAR(60); the tag keeps this run's rows apart.
  const module = runTag.toLowerCase();
  const trackedEmployeeIds: string[] = [];

  // Literal LIKE wildcards in a name: "50%_x" must match only itself.
  let literalId: string;
  let decoyId: string;
  const literalName = `${runTag} Ana 50%_x`;
  const decoyName = `${runTag} Beto 50abx`;

  // Seeded rows, by role in the assertions.
  let lateNightId: string; // 2001-03-10 23:30 session time: inside a date-only "to"
  let nextDayId: string; // 2001-03-11 00:00 session time: outside it
  let decoyRowId: string; // 2001-03-12, written by the decoy employee

  async function roleIdOf(code: string): Promise<string> {
    const rows = (await dataSource.query(
      `SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`,
      [code],
    )) as { idRol: string }[];
    if (!rows[0]) {
      throw new Error(`Seed role ${code} not found — apply database/init.sql first`);
    }
    return rows[0].idRol;
  }

  /** The permissions the seed really grants to a role (login reads the same rows). */
  async function permissionsOf(roleCode: string): Promise<string[]> {
    const rows = (await dataSource.query(
      `SELECT permiso.codigo_permiso AS "codigo"
       FROM tbl_rol AS rol
       INNER JOIN tbl_rol_permiso AS rol_permiso ON rol_permiso.id_rol = rol.id_rol
       INNER JOIN tbl_permiso AS permiso ON permiso.id_permiso = rol_permiso.id_permiso
       WHERE rol.codigo = $1
       ORDER BY permiso.codigo_permiso`,
      [roleCode],
    )) as { codigo: string }[];
    return rows.map((row) => row.codigo);
  }

  async function seedEmployee(name: string, roleId: string): Promise<string> {
    const email = `${runTag}-${trackedEmployeeIds.length}@transmetro.gt`.toLowerCase();
    const rows = (await dataSource.query(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, 'ACTIVO', $2, $3)
       RETURNING id_emple AS "idEmple"`,
      [name, email, roleId],
    )) as { idEmple: string }[];
    const id = rows[0]!.idEmple;
    trackedEmployeeIds.push(id);
    return id;
  }

  /**
   * Inserts an audit row. `fechaHora` has no offset on purpose: Postgres
   * resolves it in the session time zone, like the API's date-only bounds.
   */
  async function seedAudit(
    fechaHora: string,
    action: string,
    result: string,
    employeeId: string,
    detalle: Record<string, unknown> | null,
  ): Promise<string> {
    const rows = (await dataSource.query(
      `INSERT INTO tbl_bitacora (fecha_hora, modulo, accion, entidad_tipo, entidad_id, resultado, id_empleado, detalle)
       VALUES ($1::timestamp, $2, $3, 'e2e', 42, $4, $5, $6::jsonb)
       RETURNING id_bitacora AS "id"`,
      [fechaHora, module, action, result, employeeId, detalle === null ? null : JSON.stringify(detalle)],
    )) as { id: string }[];
    return String(rows[0]!.id);
  }

  // Not async: callers chain supertest's .expect() on the returned Test.
  function list(query: Record<string, string | number>, token = operatorToken) {
    return request(app.getHttpServer())
      .get("/audit-log")
      .query({ module, ...query })
      .set("Authorization", `Bearer ${token}`);
  }

  const ids = (body: AuditPageBody) => body.items.map((item) => item.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirrors src/main.ts: the global validation pipe is not part of AppModule.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    const operatorRoleId = await roleIdOf(OPERATOR_ROLE_CODE);
    const pilotRoleId = await roleIdOf(PILOT_ROLE_CODE);

    const operatorId = await seedEmployee(`${runTag} Operator`, operatorRoleId);
    operatorToken = signToken(operatorId, OPERATOR_ROLE_CODE, await permissionsOf(OPERATOR_ROLE_CODE));
    const pilotId = await seedEmployee(`${runTag} Pilot`, pilotRoleId);
    pilotToken = signToken(pilotId, PILOT_ROLE_CODE, await permissionsOf(PILOT_ROLE_CODE));

    literalId = await seedEmployee(literalName, operatorRoleId);
    decoyId = await seedEmployee(decoyName, operatorRoleId);

    lateNightId = await seedAudit("2001-03-10 23:30:00", "create_e2e", "EXITOSO", literalId, {
      campo: "valor",
      anidado: { n: 1, lista: [true, null] },
    });
    nextDayId = await seedAudit("2001-03-11 00:00:00", "update_e2e", "FALLIDO", literalId, null);
    decoyRowId = await seedAudit("2001-03-12 08:00:00", "update_e2e", "EXITOSO", decoyId, null);
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query(`DELETE FROM tbl_bitacora WHERE modulo = $1`, [module]);
      if (trackedEmployeeIds.length > 0) {
        await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [
          trackedEmployeeIds,
        ]);
      }
    }
    if (app) {
      await app.close();
    }
  });

  // --------------------------------------------------------------------------
  // Authorization
  // --------------------------------------------------------------------------
  it("seed grants AUDITORIA_BITACORA_CONSULTAR to OPERADOR_CENTRAL but not to PILOTO", async () => {
    expect(await permissionsOf(OPERATOR_ROLE_CODE)).toContain(AUDITORIA_BITACORA_CONSULTAR);
    expect(await permissionsOf(PILOT_ROLE_CODE)).not.toContain(AUDITORIA_BITACORA_CONSULTAR);
  });

  it("returns 401 without a token on both routes", async () => {
    await request(app.getHttpServer()).get("/audit-log").expect(401);
    await request(app.getHttpServer()).get("/audit-log/options").expect(401);
  });

  it("returns 403 on both routes for a role without AUDITORIA_BITACORA_CONSULTAR", async () => {
    await list({}, pilotToken).expect(403);
    await request(app.getHttpServer())
      .get("/audit-log/options")
      .set("Authorization", `Bearer ${pilotToken}`)
      .expect(403);
  });

  it("exposes no mutation routes", async () => {
    const http = app.getHttpServer();
    const bearer = `Bearer ${operatorToken}`;
    await request(http).post("/audit-log").set("Authorization", bearer).send({}).expect(404);
    await request(http).patch(`/audit-log/${lateNightId}`).set("Authorization", bearer).send({}).expect(404);
    await request(http).delete(`/audit-log/${lateNightId}`).set("Authorization", bearer).expect(404);
  });

  // --------------------------------------------------------------------------
  // Listing
  // --------------------------------------------------------------------------
  it("lists this run's rows newest first, joined with the responsible employee", async () => {
    const response = await list({}).expect(200);
    const body = response.body as AuditPageBody;

    expect(body.total).toBe(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(ids(body)).toEqual([decoyRowId, nextDayId, lateNightId]);

    const late = body.items[2]!;
    expect(late).toMatchObject({
      module,
      action: "create_e2e",
      entityType: "e2e",
      entityId: "42",
      result: "EXITOSO",
      employee: { id: String(literalId), name: literalName },
    });
    expect(late.employee.email).toMatch(/@transmetro\.gt$/);
    expect(Number.isNaN(Date.parse(late.createdAt))).toBe(false);
  });

  it("round-trips the JSONB detalle and returns null when absent", async () => {
    const body = (await list({}).expect(200)).body as AuditPageBody;
    const byId = new Map(body.items.map((item) => [item.id, item]));

    expect(byId.get(lateNightId)!.detalle).toEqual({ campo: "valor", anidado: { n: 1, lista: [true, null] } });
    expect(byId.get(nextDayId)!.detalle).toBeNull();
  });

  it("paginates with a numeric total", async () => {
    const first = (await list({ pageSize: 2, page: 1 }).expect(200)).body as AuditPageBody;
    const second = (await list({ pageSize: 2, page: 2 }).expect(200)).body as AuditPageBody;
    const beyond = (await list({ pageSize: 2, page: 3 }).expect(200)).body as AuditPageBody;

    expect(first.total).toBe(3);
    expect(typeof first.total).toBe("number");
    expect(ids(first)).toEqual([decoyRowId, nextDayId]);
    expect(ids(second)).toEqual([lateNightId]);
    expect(beyond).toEqual({ items: [], total: 3, page: 3, pageSize: 2 });
  });

  // --------------------------------------------------------------------------
  // Filters
  // --------------------------------------------------------------------------
  it("treats a date-only 'to' as the whole day in the session time zone", async () => {
    const body = (await list({ to: "2001-03-10" }).expect(200)).body as AuditPageBody;
    expect(ids(body)).toEqual([lateNightId]);
  });

  it("treats a date-only 'from' as the start of that day", async () => {
    const body = (await list({ from: "2001-03-11" }).expect(200)).body as AuditPageBody;
    expect(ids(body)).toEqual([decoyRowId, nextDayId]);
  });

  it("combines from and to into an inclusive range", async () => {
    const body = (await list({ from: "2001-03-11", to: "2001-03-11" }).expect(200)).body as AuditPageBody;
    expect(ids(body)).toEqual([nextDayId]);
    expect(body.total).toBe(1);
  });

  it("matches the user filter case-insensitively on name and on email", async () => {
    const byName = (await list({ user: `${runTag} beto`.toUpperCase() }).expect(200)).body as AuditPageBody;
    expect(ids(byName)).toEqual([decoyRowId]);

    const email = byName.items[0]!.employee.email;
    const byEmail = (await list({ user: email.toUpperCase() }).expect(200)).body as AuditPageBody;
    expect(ids(byEmail)).toEqual([decoyRowId]);
  });

  it("treats LIKE wildcards in the user filter literally", async () => {
    // Unescaped, "50%_x" would also match "50abx" (the decoy).
    const body = (await list({ user: "50%_x" }).expect(200)).body as AuditPageBody;
    expect(ids(body)).toEqual([nextDayId, lateNightId]);
    expect(body.items.every((item) => item.employee.id === String(literalId))).toBe(true);
  });

  it("filters by action and by result, alone and combined", async () => {
    const byAction = (await list({ action: "update_e2e" }).expect(200)).body as AuditPageBody;
    expect(ids(byAction)).toEqual([decoyRowId, nextDayId]);

    const byResult = (await list({ result: "FALLIDO" }).expect(200)).body as AuditPageBody;
    expect(ids(byResult)).toEqual([nextDayId]);

    const both = (await list({ action: "update_e2e", result: "EXITOSO" }).expect(200)).body as AuditPageBody;
    expect(ids(both)).toEqual([decoyRowId]);
  });

  it("returns an empty page when nothing matches", async () => {
    const body = (await list({ action: "no_such_action" }).expect(200)).body as AuditPageBody;
    expect(body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("rejects invalid query parameters with 400", async () => {
    await list({ result: "OK" }).expect(400);
    await list({ pageSize: 101 }).expect(400);
    await list({ page: 0 }).expect(400);
    await list({ from: "2001-13-45" }).expect(400);
  });

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------
  it("lists distinct sorted modules and actions, including this run's", async () => {
    const response = await request(app.getHttpServer())
      .get("/audit-log/options")
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);
    const { modules, actions } = response.body as { modules: string[]; actions: string[] };

    expect(modules).toContain(module);
    expect(actions).toEqual(expect.arrayContaining(["create_e2e", "update_e2e"]));
    expect(new Set(modules).size).toBe(modules.length);
    expect(new Set(actions).size).toBe(actions.length);
    // Same ordering as Postgres ORDER BY under the database collation.
    const sorted = (await dataSource.query(
      `SELECT DISTINCT modulo AS value FROM tbl_bitacora ORDER BY modulo`,
    )) as { value: string }[];
    expect(modules).toEqual(sorted.map((row) => row.value));
  });
});
