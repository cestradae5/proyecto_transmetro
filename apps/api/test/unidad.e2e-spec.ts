// E2E HTTP test for the Unidad CRUD endpoints (Slice 2, task 2.3.3).
//
// Follows the same real-app-boot convention as health.e2e-spec.ts (full
// AppModule, real Postgres via DATABASE_* env vars) rather than
// authentication.e2e-spec.ts's fully-mocked DataSource, because this test
// exercises real transactions, the real EN_SERVICIO gate (raw SQL against
// tbl_asignacion_unidad/tbl_asignacion_piloto), and real tbl_bitacora
// audit rows — none of which a mocked DataSource can prove.
//
// RUNS against the test database. `npm run test:e2e` forces
// DATABASE_NAME=transmetro_test (see apps/api/package.json), so this suite never
// writes to the development database. A local PostgreSQL 18.4 service is
// available on localhost:5432 — the earlier "no database available" note in
// this file was wrong: it inferred an unreachable Docker daemon, not the
// absence of Postgres.
//
// Requires apps/api/.env to be exported into the shell (DATABASE_USER,
// DATABASE_PASSWORD, DATABASE_HOST, DATABASE_PORT, JWT_SECRET); jest-e2e.json
// has no dotenv setupFiles, so the run does not load .env itself.

process.env.ADMIN_WEB_ORIGINS ??= "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID ??= "test-client-id";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";
const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";
// Seeded in database/init.sql — OPERADOR_CENTRAL already has FLOTA_GESTIONAR.
const OPERATOR_ROLE_CODE = "OPERADOR_CENTRAL";

function signToken(employeeId: string): string {
  return jwt.sign(
    {
      employeeId,
      email: "e2e-unidad@transmetro.gt",
      roles: [OPERATOR_ROLE_CODE],
      permissions: [FLOTA_GESTIONAR],
      scope: { role: OPERATOR_ROLE_CODE, modules: ["passengers"] },
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

describe("Unidad CRUD (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let actorEmployeeId: string;
  const createdUnitIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);

    const roleRows = (await dataSource.query(
      `SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`,
      [OPERATOR_ROLE_CODE],
    )) as { idRol: string }[];
    if (!roleRows[0]) {
      throw new Error(`Seed role ${OPERATOR_ROLE_CODE} not found in tbl_rol`);
    }
    const role = roleRows[0];

    const employeeRows = (await dataSource.query(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, 'ACTIVO', $2, $3)
       RETURNING id_emple AS "idEmple"`,
      ["E2E Unidad Tester", `e2e-unidad-${Date.now()}@transmetro.gt`, role.idRol],
    )) as { idEmple: string }[];
    if (!employeeRows[0]) {
      throw new Error("Failed to insert e2e test employee");
    }

    actorEmployeeId = employeeRows[0].idEmple;
    token = signToken(actorEmployeeId);
  });

  afterAll(async () => {
    if (createdUnitIds.length > 0) {
      await dataSource.query(`DELETE FROM tbl_bitacora WHERE entidad_id = ANY($1::bigint[])`, [
        createdUnitIds,
      ]);
      await dataSource.query(`DELETE FROM tbl_unidad WHERE id_unidad = ANY($1::bigint[])`, [
        createdUnitIds,
      ]);
    }
    if (actorEmployeeId) {
      await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = $1`, [actorEmployeeId]);
    }
    await app.close();
  });

  it("POST /fleet/units creates a unit and writes a CREATE audit row", async () => {
    const response = await request(app.getHttpServer())
      .post("/fleet/units")
      .set("Authorization", `Bearer ${token}`)
      .send({
        numeroPlaca: `E2E-${Date.now()}`,
        marca: "Volvo",
        modelo: "B440",
        anio: 2024,
        capacidadPasajeros: 50,
      })
      .expect(201);

    expect(response.body.estadoUnidad).toBe("DISPONIBLE");
    createdUnitIds.push(response.body.idUnidad);

    const auditRows = (await dataSource.query(
      `SELECT accion, resultado FROM tbl_bitacora WHERE modulo = 'fleet' AND entidad_id = $1`,
      [response.body.idUnidad],
    )) as { accion: string; resultado: string }[];
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toEqual({ accion: "create", resultado: "EXITOSO" });
  });

  it("GET /fleet/units/{id} returns the created unit", async () => {
    const unitId = createdUnitIds[0];

    const response = await request(app.getHttpServer())
      .get(`/fleet/units/${unitId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.idUnidad).toBe(unitId);
    expect(response.body.idLinea).toBeUndefined();
  });

  it("PATCH /fleet/units/{id} updates capacity and bumps fechaActualizacion", async () => {
    const unitId = createdUnitIds[0];
    const before = await request(app.getHttpServer())
      .get(`/fleet/units/${unitId}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app.getHttpServer())
      .patch(`/fleet/units/${unitId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ capacidadPasajeros: 60 })
      .expect(200);

    expect(response.body.capacidadPasajeros).toBe(60);
    expect(new Date(response.body.fechaActualizacion).getTime()).toBeGreaterThan(
      new Date(before.body.fechaActualizacion).getTime(),
    );
  });

  it("PATCH /fleet/units/{id} to EN_SERVICIO without assignments returns 409 and makes no state change", async () => {
    const unitId = createdUnitIds[0];

    await request(app.getHttpServer())
      .patch(`/fleet/units/${unitId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ estadoUnidad: "EN_SERVICIO" })
      .expect(409);

    const response = await request(app.getHttpServer())
      .get(`/fleet/units/${unitId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(response.body.estadoUnidad).not.toBe("EN_SERVICIO");
  });

  it("DELETE /fleet/units/{id} sets estadoUnidad to FUERA_DE_SERVICIO", async () => {
    const unitId = createdUnitIds[0];

    const response = await request(app.getHttpServer())
      .delete(`/fleet/units/${unitId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.estadoUnidad).toBe("FUERA_DE_SERVICIO");
  });

  it("GET /fleet/units without a token is rejected with 401", async () => {
    await request(app.getHttpServer()).get("/fleet/units").expect(401);
  });
});
