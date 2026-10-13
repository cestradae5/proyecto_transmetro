// ============================================================================
// E2E for odd/tasks/bitacora-completion.md (T13), against real Postgres.
//
// Unit specs mock the transaction and the audit repository, so only this suite
// proves, with the real schema:
//   - S2/S3: an Infrastructure mutation over HTTP writes exactly one
//     tbl_bitacora row in the same transaction, with the authenticated actor.
//   - S5/S6: a failed login persists a FALLIDO row with NULL id_empleado and
//     entidad_id (the transaction commits; the error is thrown afterwards) and
//     never stores the attempted email.
//   - S7: GET /audit-log lists that row with employee null (LEFT JOIN).
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Requires
// apps/api/.env exported and database/init.sql applied (nullable columns).
// Everything created here is removed in afterAll.
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
import { AuthenticationService } from "../src/authentication/authentication.service.js";
import { GOOGLE_CREDENTIAL_VERIFIER } from "../src/authentication/infrastructure/google-credential-verifier.port.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";
const OPERATOR_ROLE_CODE = "OPERADOR_CENTRAL";

describe("Bitácora completion (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let operatorId: string;
  let operatorToken: string;

  const runTag = `E2E-BIT-${Date.now()}`;
  const ghostEmail = `${runTag.toLowerCase()}-ghost@transmetro.gt`;
  let baselineAuditId = "0";
  let municipalidadId: string | undefined;

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await dataSource.query(sql, params)) as T[];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_CREDENTIAL_VERIFIER)
      .useValue({ verify: async () => ({ email: ghostEmail }) })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    const [role] = await rows<{ idRol: string }>(
      `SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`,
      [OPERATOR_ROLE_CODE],
    );
    if (!role) throw new Error("Seed role missing — apply database/init.sql first");
    const [emp] = await rows<{ id: string }>(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, 'ACTIVO', $2, $3) RETURNING id_emple AS "id"`,
      [`${runTag} Operator`, `${runTag.toLowerCase()}-op@transmetro.gt`, role.idRol],
    );
    operatorId = String(emp!.id);
    const permissions = (
      await rows<{ codigo: string }>(
        `SELECT p.codigo_permiso AS "codigo" FROM tbl_rol r
         JOIN tbl_rol_permiso rp ON rp.id_rol = r.id_rol
         JOIN tbl_permiso p ON p.id_permiso = rp.id_permiso WHERE r.codigo = $1`,
        [OPERATOR_ROLE_CODE],
      )
    ).map((r) => r.codigo);
    operatorToken = jwt.sign(
      {
        employeeId: operatorId,
        email: `${runTag.toLowerCase()}-op@transmetro.gt`,
        roles: [OPERATOR_ROLE_CODE],
        permissions,
        scope: { role: OPERATOR_ROLE_CODE, modules: [] },
      },
      JWT_SECRET,
      { expiresIn: "12h" },
    );

    const [max] = await rows<{ max: string | null }>(`SELECT MAX(id_bitacora) AS "max" FROM tbl_bitacora`);
    baselineAuditId = max?.max ?? "0";
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query(`DELETE FROM tbl_bitacora WHERE id_bitacora > $1 AND (id_empleado = $2 OR (id_empleado IS NULL AND modulo = 'authentication'))`, [baselineAuditId, operatorId]);
      if (municipalidadId) {
        await dataSource.query(`DELETE FROM tbl_municipalidad WHERE id_municipalidad = $1`, [municipalidadId]);
      }
      if (operatorId) {
        await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = $1`, [operatorId]);
      }
    }
    if (app) await app.close();
  });

  it("POST /infrastructure/municipalidades writes one audit row with the authenticated actor", async () => {
    const res = await request(app.getHttpServer())
      .post("/infrastructure/municipalidades")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ nombreMunicipalidad: `${runTag} Muni`, departamento: "Guatemala" })
      .expect(201);
    municipalidadId = String(res.body.idMunicipalidad);

    const audit = await rows<Record<string, unknown>>(
      `SELECT modulo, accion, entidad_tipo, entidad_id::text AS entidad_id, resultado,
              id_empleado::text AS id_empleado, detalle
         FROM tbl_bitacora WHERE id_bitacora > $1 AND entidad_tipo = 'municipalidad' AND entidad_id = $2`,
      [baselineAuditId, municipalidadId],
    );
    expect(audit).toEqual([
      {
        modulo: "infrastructure",
        accion: "create",
        entidad_tipo: "municipalidad",
        entidad_id: municipalidadId,
        resultado: "EXITOSO",
        id_empleado: operatorId,
        detalle: {
          nombreMunicipalidad: `${runTag} Muni`,
          departamento: "Guatemala",
          estadoMunicipalidad: "ACTIVA",
        },
      },
    ]);
  });

  it("a rejected mutation (duplicate nombre, 409) writes no audit row and no data", async () => {
    const before = await rows<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tbl_bitacora WHERE id_bitacora > $1 AND id_empleado = $2`,
      [baselineAuditId, operatorId],
    );
    await request(app.getHttpServer())
      .post("/infrastructure/municipalidades")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ nombreMunicipalidad: `${runTag} Muni`, departamento: "Otro" })
      .expect(409);
    const after = await rows<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tbl_bitacora WHERE id_bitacora > $1 AND id_empleado = $2`,
      [baselineAuditId, operatorId],
    );
    expect(after[0]!.n).toBe(before[0]!.n);
    const munis = await rows<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tbl_municipalidad WHERE nombre_municipalidad = $1`,
      [`${runTag} Muni`],
    );
    expect(munis[0]!.n).toBe(1);
  });

  it("a failed login persists a FALLIDO row without employee, entity or email, then rejects", async () => {
    const auth = app.get(AuthenticationService);

    await expect(auth.login("any-credential")).rejects.toThrow("Credenciales inválidas.");

    const failed = await rows<Record<string, unknown>>(
      `SELECT modulo, accion, entidad_tipo, entidad_id, resultado, id_empleado, detalle
         FROM tbl_bitacora WHERE id_bitacora > $1 AND modulo = 'authentication' AND resultado = 'FALLIDO'`,
      [baselineAuditId],
    );
    expect(failed).toEqual([
      {
        modulo: "authentication",
        accion: "LOGIN",
        entidad_tipo: "jwt",
        entidad_id: null,
        resultado: "FALLIDO",
        id_empleado: null,
        detalle: null,
      },
    ]);
    expect(JSON.stringify(failed).toLowerCase()).not.toContain(ghostEmail);
  });

  it("GET /audit-log lists the failed login with employee null (LEFT JOIN)", async () => {
    const res = await request(app.getHttpServer())
      .get("/audit-log")
      .query({ module: "authentication", result: "FALLIDO", pageSize: 100 })
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);

    const mine = (res.body.items as Array<Record<string, unknown>>).filter(
      (item) => BigInt(String(item.id)) > BigInt(baselineAuditId),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toEqual(
      expect.objectContaining({
        module: "authentication",
        action: "LOGIN",
        entityType: "jwt",
        entityId: null,
        result: "FALLIDO",
        employee: null,
      }),
    );
  });
});
