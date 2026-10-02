// ============================================================================
// E2E HTTP contract for the Personal module's employee administration routes
// (task E6, odd/tasks/personal-backend.md).
//
// Same real-app-boot convention as piloto.e2e-spec.ts: the full AppModule
// against real Postgres. This suite is the first thing that exercises the
// seven `tbl_empleado` HR columns and the partial unique index on DPI added
// by task E1 against a real database — database/init.sql must have been
// applied to `transmetro_test` before running it.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test
// (apps/api/package.json), so the development database is never touched.
// Requires apps/api/.env exported into the shell (DATABASE_HOST/PORT/USER/
// PASSWORD, JWT_SECRET); jest-e2e.json has no dotenv setupFiles.
//
// Two deliberate deviations from the sibling specs, both required for fidelity:
//
// 1. `app.useGlobalPipes(new ValidationPipe({whitelist: true, transform: true}))`
//    is applied here exactly as in src/main.ts. main.ts — not AppModule — owns
//    the global pipe, so an e2e that only calls `app.init()` runs without any
//    validation and every "rejects an invalid payload" case would silently
//    reach the service instead of answering 400.
// 2. Permissions in the signed JWTs are read from tbl_permiso/tbl_rol_permiso
//    instead of being hardcoded, so the 403 cases assert what the seed really
//    grants rather than a copy of it that could silently drift.
//
// Every employee, session-independent fixture and tbl_bitacora row this suite
// creates is removed in afterAll: the suite is re-runnable and leaves
// transmetro_test as it found it.
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

const EMPLEADOS_PERFILES_ADMINISTRAR = "EMPLEADOS_PERFILES_ADMINISTRAR";
const OPERATOR_ROLE_CODE = "OPERADOR_CENTRAL";
const PILOT_ROLE_CODE = "PILOTO";
const GUARD_ROLE_CODE = "GUARDIA";
const STATION_ROLE_CODE = "OPERADOR_ESTACION";
const UNKNOWN_ROLE_ID = "999999999";

interface EmployeeBody {
  id: string;
  name: string;
  email: string;
  status: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  phone: string | null;
  dpi: string | null;
  hireDate: string | null;
  address: string | null;
  licenseNumber: string | null;
  educationHistory: string | null;
  languages: string | null;
}

interface StoredEmployeeRow {
  dpi_emple: string | null;
  telefono_emple: string | null;
  fecha_ingreso_emple: string | null;
  direccion_emple: string | null;
  licencia_emple: string | null;
  historial_educativo_emple: string | null;
  idiomas_emple: string | null;
}

interface AuditRow {
  id_bitacora: string;
  modulo: string;
  accion: string;
  entidad_tipo: string;
  resultado: string;
  id_empleado: string;
  detalle: string;
}

function signToken(employeeId: string, roleCode: string, permissions: string[]): string {
  return jwt.sign(
    {
      employeeId,
      email: `e2e-personal-${employeeId}@transmetro.gt`,
      roles: [roleCode],
      permissions,
      scope: { role: roleCode, modules: [] },
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

describe("Personal /personal/empleados (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let operatorToken: string;
  let operatorId: string;
  let pilotToken: string;

  let operatorRoleId: string;
  let pilotRoleId: string;
  let guardRoleId: string;
  let stationRoleId: string;
  let stationRoleWasActive: boolean;

  // Every employee row this suite creates, directly or through the API.
  const trackedEmployeeIds: string[] = [];

  const runTag = `E2E-PER-${Date.now()}`;
  // A distinct tag for the listing fixtures, so `search` assertions can be
  // scoped to exactly three rows while the suite creates many more.
  const listTag = `${runTag}-LIST`;
  const unknownId = "888888888";

  let dpiSequence = 0;
  let emailSequence = 0;

  /** 13 digits (dpi_emple is VARCHAR(13) and the DTO requires exactly 13). */
  function uniqueDpi(): string {
    dpiSequence += 1;
    return `99${String(Date.now() + dpiSequence).slice(-11)}`;
  }

  function uniqueEmail(label: string): string {
    emailSequence += 1;
    return `e2e-personal-${runTag}-${emailSequence}-${label}@transmetro.gt`.toLowerCase();
  }

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

  /** Inserts an employee row directly, bypassing the API (fixtures and actors). */
  async function seedEmployee(
    name: string,
    email: string,
    roleId: string,
  ): Promise<string> {
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

  function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      name: `${runTag} Employee`,
      email: uniqueEmail("employee"),
      roleId: guardRoleId,
      dpi: uniqueDpi(),
      ...overrides,
    };
  }

  /** POST /personal/empleados as the authorized operator; asserts 201 and tracks the row. */
  async function createEmployee(
    overrides: Record<string, unknown> = {},
  ): Promise<EmployeeBody> {
    const response = await request(app.getHttpServer())
      .post("/personal/empleados")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send(payload(overrides))
      .expect(201);
    trackedEmployeeIds.push(response.body.id as string);
    return response.body as EmployeeBody;
  }

  async function readStoredRow(id: string): Promise<StoredEmployeeRow | undefined> {
    const rows = (await dataSource.query(
      `SELECT dpi_emple, telefono_emple, fecha_ingreso_emple, direccion_emple,
              licencia_emple, historial_educativo_emple, idiomas_emple
       FROM tbl_empleado WHERE id_emple = $1`,
      [id],
    )) as StoredEmployeeRow[];
    return rows[0];
  }

  /** Personal audit rows written for one target employee, oldest first. */
  async function auditRows(entityId: string): Promise<AuditRow[]> {
    return (await dataSource.query(
      `SELECT id_bitacora AS "id_bitacora",
              modulo,
              accion,
              entidad_tipo,
              resultado,
              id_empleado AS "id_empleado",
              COALESCE(detalle::text, '') AS detalle
       FROM tbl_bitacora
       WHERE modulo = 'personal' AND entidad_tipo = 'empleado' AND entidad_id = $1
       ORDER BY id_bitacora ASC`,
      [entityId],
    )) as AuditRow[];
  }

  /** The shared shape every personal audit row must have. */
  function expectPersonalAuditRow(row: AuditRow, accion: string): void {
    expect(row.modulo).toBe("personal");
    expect(row.entidad_tipo).toBe("empleado");
    expect(row.accion).toBe(accion);
    expect(row.resultado).toBe("EXITOSO");
  }

  /** PII values that must never reach the audit detail. */
  function expectNoPii(detalle: string, pii: string[]): void {
    for (const value of pii) {
      expect(detalle).not.toContain(value);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirrors src/main.ts: the global validation pipe is not part of AppModule.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    operatorRoleId = await roleIdOf(OPERATOR_ROLE_CODE);
    pilotRoleId = await roleIdOf(PILOT_ROLE_CODE);
    guardRoleId = await roleIdOf(GUARD_ROLE_CODE);
    stationRoleId = await roleIdOf(STATION_ROLE_CODE);

    const stationRoleRows = (await dataSource.query(
      `SELECT activo FROM tbl_rol WHERE codigo = $1`,
      [STATION_ROLE_CODE],
    )) as { activo: boolean }[];
    stationRoleWasActive = stationRoleRows[0]!.activo;

    const operatorPermissions = await permissionsOf(OPERATOR_ROLE_CODE);
    const pilotPermissions = await permissionsOf(PILOT_ROLE_CODE);

    operatorId = await seedEmployee(
      `${runTag} Operator`,
      uniqueEmail("operator"),
      operatorRoleId,
    );
    operatorToken = signToken(operatorId, OPERATOR_ROLE_CODE, operatorPermissions);

    // A real PILOTO employee, so the 403 cases carry a genuine role.
    const pilotId = await seedEmployee(
      `${runTag} Pilot`,
      uniqueEmail("pilot-actor"),
      pilotRoleId,
    );
    pilotToken = signToken(pilotId, PILOT_ROLE_CODE, pilotPermissions);
  });

  afterAll(async () => {
    if (dataSource && trackedEmployeeIds.length > 0) {
      // tbl_bitacora.id_empleado references tbl_empleado: audit rows first.
      await dataSource.query(
        `DELETE FROM tbl_bitacora
         WHERE modulo = 'personal'
           AND (id_empleado = ANY($1::bigint[]) OR entidad_id = ANY($1::bigint[]))`,
        [trackedEmployeeIds],
      );
      await dataSource.query(
        `DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`,
        [trackedEmployeeIds],
      );
    }
    if (dataSource && !stationRoleWasActive) {
      await dataSource.query(`UPDATE tbl_rol SET activo = TRUE WHERE codigo = $1`, [
        STATION_ROLE_CODE,
      ]);
    }
    if (app) {
      await app.close();
    }
  });

  // --------------------------------------------------------------------------
  // Permission baseline
  // --------------------------------------------------------------------------
  it("seed grants EMPLEADOS_PERFILES_ADMINISTRAR to OPERADOR_CENTRAL but not to PILOTO", async () => {
    expect(await permissionsOf(OPERATOR_ROLE_CODE)).toContain(
      EMPLEADOS_PERFILES_ADMINISTRAR,
    );
    expect(await permissionsOf(PILOT_ROLE_CODE)).not.toContain(
      EMPLEADOS_PERFILES_ADMINISTRAR,
    );
  });

  it("returns 401 without a token", async () => {
    await request(app.getHttpServer()).get("/personal/empleados").expect(401);
  });

  it("returns 403 on every route for a role without EMPLEADOS_PERFILES_ADMINISTRAR", async () => {
    const http = app.getHttpServer();
    const bearer = `Bearer ${pilotToken}`;

    await request(http).get("/personal/empleados").set("Authorization", bearer).expect(403);
    await request(http)
      .post("/personal/empleados")
      .set("Authorization", bearer)
      .send(payload())
      .expect(403);
    await request(http)
      .get(`/personal/empleados/${unknownId}`)
      .set("Authorization", bearer)
      .expect(403);
    await request(http)
      .patch(`/personal/empleados/${unknownId}`)
      .set("Authorization", bearer)
      .send({ name: "nope" })
      .expect(403);
    await request(http)
      .delete(`/personal/empleados/${unknownId}`)
      .set("Authorization", bearer)
      .expect(403);
  });

  // --------------------------------------------------------------------------
  // Happy path
  // --------------------------------------------------------------------------
  it("creates an employee with a DPI, persists the HR columns and audits without PII", async () => {
    const dpi = uniqueDpi();
    const email = uniqueEmail("happy");
    const response = await request(app.getHttpServer())
      .post("/personal/empleados")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({
        name: `${runTag} Happy Path`,
        email,
        roleId: guardRoleId,
        dpi,
        phone: "+502 5555-1234",
        hireDate: "2024-03-15",
        address: "1 Calle Central, Zone 1",
        educationHistory: "Bachiller en Ciencias y Letras",
        languages: "Espanol, Ingles",
      })
      .expect(201);

    const created = response.body as EmployeeBody;
    trackedEmployeeIds.push(created.id);

    // Status defaults to ACTIVO when the payload omits it.
    expect(created).toMatchObject({
      name: `${runTag} Happy Path`,
      email,
      status: "ACTIVO",
      roleId: guardRoleId,
      roleCode: GUARD_ROLE_CODE,
      phone: "+502 5555-1234",
      dpi,
      address: "1 Calle Central, Zone 1",
      licenseNumber: null,
      educationHistory: "Bachiller en Ciencias y Letras",
      languages: "Espanol, Ingles",
    });
    expect(created.roleName).toBeTruthy();
    expect(created.hireDate).toMatch(/^2024-03-15/);

    // Every new column really landed in tbl_empleado.
    const stored = await readStoredRow(created.id);
    expect(stored).toBeDefined();
    expect(stored).toMatchObject({
      dpi_emple: dpi,
      telefono_emple: "+502 5555-1234",
      direccion_emple: "1 Calle Central, Zone 1",
      historial_educativo_emple: "Bachiller en Ciencias y Letras",
      idiomas_emple: "Espanol, Ingles",
      licencia_emple: null,
    });

    const rows = await auditRows(created.id);
    expect(rows).toHaveLength(1);
    expectPersonalAuditRow(rows[0]!, "create");
    expect(rows[0]!.id_empleado).toBe(operatorId);
    expect(rows[0]!.detalle).toContain(email);
    expectNoPii(rows[0]!.detalle, [
      dpi,
      "+502 5555-1234",
      "1 Calle Central, Zone 1",
      "Bachiller en Ciencias y Letras",
      "Espanol, Ingles",
    ]);
  });

  it("lists employees filtered by search, status and roleId", async () => {
    const active = await createEmployee({ name: `${listTag} Active` });
    const inactive = await createEmployee({
      name: `${listTag} Inactive`,
      roleId: stationRoleId,
      status: "INACTIVO",
    });
    const pilot = await createEmployee({
      name: `${listTag} Pilot`,
      roleId: pilotRoleId,
      licenseNumber: "LIC-E2E-1",
    });

    const listed = async (query: string): Promise<EmployeeBody[]> => {
      const response = await request(app.getHttpServer())
        .get(`/personal/empleados${query}`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(200);
      return response.body as EmployeeBody[];
    };

    const idsOf = (items: EmployeeBody[]): string[] => items.map((item) => item.id);

    // The seeded admin and every other fixture are excluded by the search term.
    expect(new Set(idsOf(await listed(`?search=${listTag}`)))).toEqual(
      new Set([active.id, inactive.id, pilot.id]),
    );

    const byStatus = await listed(`?search=${listTag}&status=INACTIVO`);
    expect(idsOf(byStatus)).toEqual([inactive.id]);

    const byRole = await listed(`?search=${listTag}&roleId=${pilotRoleId}`);
    expect(idsOf(byRole)).toEqual([pilot.id]);

    const byAll = await listed(
      `?search=${listTag}&status=ACTIVO&roleId=${pilotRoleId}`,
    );
    expect(idsOf(byAll)).toEqual([pilot.id]);

    // Unscoped role filter: everything the endpoint returns is a pilot.
    const allPilots = await listed(`?roleId=${pilotRoleId}`);
    expect(allPilots.length).toBeGreaterThanOrEqual(1);
    for (const item of allPilots) {
      expect(item.roleCode).toBe(PILOT_ROLE_CODE);
    }

    await request(app.getHttpServer())
      .get("/personal/empleados?status=NOPE")
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(400);
  });

  it("gets an employee by id and answers 404 for an unknown id", async () => {
    const employee = await createEmployee({ name: `${runTag} Readable` });

    const response = await request(app.getHttpServer())
      .get(`/personal/empleados/${employee.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);
    expect(response.body as EmployeeBody).toEqual(employee);

    await request(app.getHttpServer())
      .get(`/personal/empleados/${unknownId}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(404);
  });

  it("updates the name and toggles the status, auditing every change", async () => {
    const dpi = uniqueDpi();
    const employee = await createEmployee({ name: `${runTag} Updatable`, dpi });

    const renamed = await request(app.getHttpServer())
      .patch(`/personal/empleados/${employee.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ name: `${runTag} Renamed` })
      .expect(200);
    expect((renamed.body as EmployeeBody).name).toBe(`${runTag} Renamed`);

    const deactivated = await request(app.getHttpServer())
      .patch(`/personal/empleados/${employee.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ status: "INACTIVO" })
      .expect(200);
    expect((deactivated.body as EmployeeBody).status).toBe("INACTIVO");

    const reactivated = await request(app.getHttpServer())
      .patch(`/personal/empleados/${employee.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ status: "ACTIVO" })
      .expect(200);
    expect((reactivated.body as EmployeeBody).status).toBe("ACTIVO");

    // Untouched fields survive the patch.
    expect((reactivated.body as EmployeeBody).dpi).toBe(dpi);

    const rows = await auditRows(employee.id);
    expect(rows.map((row) => row.accion)).toEqual([
      "create",
      "update",
      "update",
      "update",
    ]);
    for (const row of rows) {
      expectPersonalAuditRow(row, row.accion);
      expect(row.id_empleado).toBe(operatorId);
      expectNoPii(row.detalle, [dpi]);
    }
    // Update details record changed field NAMES plus the status/role transition,
    // never the new values.
    expect(rows[1]!.detalle).toContain('"name"');
    expect(rows[1]!.detalle).not.toContain(`${runTag} Renamed`);
    expect(rows[2]!.detalle).toContain('"to": "INACTIVO"');
    expect(rows[3]!.detalle).toContain('"to": "ACTIVO"');

    await request(app.getHttpServer())
      .patch(`/personal/empleados/${unknownId}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ name: "ghost" })
      .expect(404);
  });

  it("deletes an employee without history (204) and then answers 404", async () => {
    const employee = await createEmployee({ name: `${runTag} Disposable` });

    await request(app.getHttpServer())
      .delete(`/personal/empleados/${employee.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(204);
    expect(await readStoredRow(employee.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/personal/empleados/${employee.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/personal/empleados/${employee.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(404);

    const rows = await auditRows(employee.id);
    expect(rows.map((row) => row.accion)).toEqual(["create", "remove"]);
    expectPersonalAuditRow(rows[1]!, "remove");
    expect(rows[1]!.id_empleado).toBe(operatorId);
  });

  // --------------------------------------------------------------------------
  // Payload validation
  // --------------------------------------------------------------------------
  it("rejects a create without dpi and with a dpi of 12 or 14 digits", async () => {
    const withoutDpi = payload();
    delete withoutDpi.dpi;
    const response = await request(app.getHttpServer())
      .post("/personal/empleados")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send(withoutDpi)
      .expect(400);
    expect(JSON.stringify(response.body)).toContain("dpi");

    for (const dpi of ["123456789012", "12345678901234"]) {
      const rejected = await request(app.getHttpServer())
        .post("/personal/empleados")
        .set("Authorization", `Bearer ${operatorToken}`)
        .send(payload({ dpi }))
        .expect(400);
      expect(JSON.stringify(rejected.body)).toContain("dpi");
    }
  });

  it("rejects a create with a duplicate email and with a duplicate dpi (409)", async () => {
    const original = await createEmployee({ name: `${runTag} Original` });

    const duplicateEmail = await request(app.getHttpServer())
      .post("/personal/empleados")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send(payload({ email: original.email, dpi: uniqueDpi() }))
      .expect(409);
    expect(duplicateEmail.body.message as string).toContain("correo");

    const duplicateDpi = await request(app.getHttpServer())
      .post("/personal/empleados")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send(payload({ dpi: original.dpi }))
      .expect(409);
    expect(duplicateDpi.body.message as string).toContain("DPI");
  });

  it("rejects a create with an unknown role and with an inactive role (400)", async () => {
    const unknown = await request(app.getHttpServer())
      .post("/personal/empleados")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send(payload({ roleId: UNKNOWN_ROLE_ID }))
      .expect(400);
    expect(unknown.body.message as string).toContain(UNKNOWN_ROLE_ID);

    // Flip a seeded role off and restore it immediately: nothing else in this
    // suite depends on OPERADOR_ESTACION.
    await dataSource.query(`UPDATE tbl_rol SET activo = FALSE WHERE codigo = $1`, [
      STATION_ROLE_CODE,
    ]);
    try {
      const inactive = await request(app.getHttpServer())
        .post("/personal/empleados")
        .set("Authorization", `Bearer ${operatorToken}`)
        .send(payload({ roleId: stationRoleId }))
        .expect(400);
      expect(inactive.body.message as string).toContain("inactivo");
    } finally {
      await dataSource.query(`UPDATE tbl_rol SET activo = TRUE WHERE codigo = $1`, [
        STATION_ROLE_CODE,
      ]);
    }

    // The role is usable again once restored.
    const restored = await createEmployee({
      name: `${runTag} Station Operator`,
      roleId: stationRoleId,
    });
    expect(restored.roleCode).toBe(STATION_ROLE_CODE);
  });

  // --------------------------------------------------------------------------
  // Business rules
  // --------------------------------------------------------------------------
  it("accepts changing the role to PILOTO without a licence", async () => {
    const employee = await createEmployee({ name: `${runTag} Reassigned` });
    expect(employee.roleCode).toBe(GUARD_ROLE_CODE);

    // licenseNumber is optional for every role, so a role change to PILOTO
    // succeeds with no licence supplied and leaves the column null.
    const reassigned = await request(app.getHttpServer())
      .patch(`/personal/empleados/${employee.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ roleId: pilotRoleId })
      .expect(200);
    expect((reassigned.body as EmployeeBody).roleCode).toBe(PILOT_ROLE_CODE);
    expect((reassigned.body as EmployeeBody).licenseNumber).toBeNull();
    expect((await readStoredRow(employee.id))!.licencia_emple).toBeNull();

    const rows = await auditRows(employee.id);
    const roleChange = rows[rows.length - 1]!;
    expect(roleChange.accion).toBe("update");
    expect(roleChange.detalle).toContain(pilotRoleId);
  });

  it("refuses to delete the caller (409)", async () => {
    const response = await request(app.getHttpServer())
      .delete(`/personal/empleados/${operatorId}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(409);
    expect(response.body.message as string).toContain("su propio usuario");
    expect(await readStoredRow(operatorId)).toBeDefined();
  });

  it("refuses to delete an employee with history and tells the caller to deactivate", async () => {
    // The API itself creates the blocking row: `other` performs a mutation, so
    // tbl_bitacora.id_empleado = other, which is a FK to tbl_empleado.
    const otherId = await seedEmployee(
      `${runTag} With History`,
      uniqueEmail("history"),
      operatorRoleId,
    );
    const otherPermissions = await permissionsOf(OPERATOR_ROLE_CODE);
    const otherToken = signToken(otherId, OPERATOR_ROLE_CODE, otherPermissions);

    const createdByOther = await request(app.getHttpServer())
      .post("/personal/empleados")
      .set("Authorization", `Bearer ${otherToken}`)
      .send(payload({ name: `${runTag} Created By History` }))
      .expect(201);
    const createdByOtherId = createdByOther.body.id as string;
    trackedEmployeeIds.push(createdByOtherId);
    expect((await auditRows(createdByOtherId))[0]!.id_empleado).toBe(otherId);

    const response = await request(app.getHttpServer())
      .delete(`/personal/empleados/${otherId}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(409);
    expect(response.body.message as string).toContain("historial asociado");
    expect(response.body.message as string).toContain("INACTIVO");
    expect(await readStoredRow(otherId)).toBeDefined();

    // Deactivating is the documented alternative, and it works.
    const deactivated = await request(app.getHttpServer())
      .patch(`/personal/empleados/${otherId}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ status: "INACTIVO" })
      .expect(200);
    expect((deactivated.body as EmployeeBody).status).toBe("INACTIVO");
  });
});