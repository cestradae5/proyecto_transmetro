// E2E HTTP test for the AsignacionPiloto pilot-assignment and pilot
// self-service endpoints (Slice 4, task 4.3.3).
//
// Follows the same real-app-boot convention as asignacion-unidad.e2e-spec.ts
// (full AppModule, real Postgres via DATABASE_* env vars) rather than a
// mocked DataSource, because this suite exercises real transactions, real
// UNIQUE constraints on tbl_asignacion_piloto (id_empleado, id_unidad), real
// tbl_bitacora audit rows, and — critically — real Express/Nest route
// registration order (Decision 9), none of which a mocked DataSource or a
// bare controller instance can prove.
//
// RUNS against the test database. `npm run test:e2e` hardcodes
// DATABASE_NAME=transmetro_test (apps/api/package.json), so this suite never
// writes to the development database.
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
const UNIDAD_ASIGNADA_CONSULTAR = "UNIDAD_ASIGNADA_CONSULTAR";
const METRICAS_UNIDAD_REPORTAR = "METRICAS_UNIDAD_REPORTAR";
// Seeded in database/init.sql — OPERADOR_CENTRAL already has
// FLOTA_GESTIONAR; PILOTO already has UNIDAD_ASIGNADA_CONSULTAR and
// METRICAS_UNIDAD_REPORTAR.
const OPERATOR_ROLE_CODE = "OPERADOR_CENTRAL";
const PILOT_ROLE_CODE = "PILOTO";
const NON_EXISTENT_ID = "999999999";

function signToken(employeeId: string, roleCode: string, permissions: string[]): string {
  return jwt.sign(
    {
      employeeId,
      email: `e2e-asignacion-piloto-${employeeId}@transmetro.gt`,
      roles: [roleCode],
      permissions,
      scope: { role: roleCode, modules: ["passengers"] },
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

describe("AsignacionPiloto pilot-assignment and self-service (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let operatorToken: string;
  let operatorId: string;
  let pilotRoleId: string;
  const createdUnitIds: string[] = [];
  const createdEmployeeIds: string[] = [];

  // tbl_unidad.numero_placa is VARCHAR(20) — keep the fixture short and
  // unique across runs (same constraint already documented in
  // asignacion-unidad.e2e-spec.ts).
  function createPlaca(): string {
    return `E2E-PLT-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function createUnit(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/fleet/units")
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({
        numeroPlaca: createPlaca(),
        marca: "Volvo",
        modelo: "B440",
        anio: 2024,
        capacidadPasajeros: 50,
      })
      .expect(201);
    const unitId = response.body.idUnidad as string;
    createdUnitIds.push(unitId);
    return unitId;
  }

  async function createPilot(): Promise<{ id: string; token: string }> {
    const rows = (await dataSource.query(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, 'ACTIVO', $2, $3)
       RETURNING id_emple AS "idEmple"`,
      [
        "E2E Pilot",
        `e2e-piloto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@transmetro.gt`,
        pilotRoleId,
      ],
    )) as { idEmple: string }[];
    const id = rows[0]!.idEmple;
    createdEmployeeIds.push(id);
    return {
      id,
      token: signToken(id, PILOT_ROLE_CODE, [UNIDAD_ASIGNADA_CONSULTAR, METRICAS_UNIDAD_REPORTAR]),
    };
  }

  async function createNonPilotEmployee(): Promise<string> {
    const rows = (await dataSource.query(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, 'ACTIVO', $2, (SELECT id_rol FROM tbl_rol WHERE codigo = $3))
       RETURNING id_emple AS "idEmple"`,
      [
        "E2E Non-Pilot",
        `e2e-non-piloto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@transmetro.gt`,
        OPERATOR_ROLE_CODE,
      ],
    )) as { idEmple: string }[];
    const id = rows[0]!.idEmple;
    createdEmployeeIds.push(id);
    return id;
  }

  async function auditRows(unitId: string): Promise<{ accion: string; resultado: string }[]> {
    return (await dataSource.query(
      `SELECT accion, resultado FROM tbl_bitacora
       WHERE modulo = 'fleet' AND entidad_tipo = 'asignacion_piloto' AND entidad_id = $1
       ORDER BY id_bitacora ASC`,
      [unitId],
    )) as { accion: string; resultado: string }[];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    dataSource = moduleRef.get(DataSource);

    const operatorRoleRows = (await dataSource.query(
      `SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`,
      [OPERATOR_ROLE_CODE],
    )) as { idRol: string }[];
    if (!operatorRoleRows[0]) {
      throw new Error(`Seed role ${OPERATOR_ROLE_CODE} not found in tbl_rol`);
    }

    const pilotRoleRows = (await dataSource.query(
      `SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`,
      [PILOT_ROLE_CODE],
    )) as { idRol: string }[];
    if (!pilotRoleRows[0]) {
      throw new Error(`Seed role ${PILOT_ROLE_CODE} not found in tbl_rol`);
    }
    pilotRoleId = pilotRoleRows[0].idRol;

    const operatorRows = (await dataSource.query(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, 'ACTIVO', $2, $3)
       RETURNING id_emple AS "idEmple"`,
      [
        "E2E AsignacionPiloto Operator",
        `e2e-asignacion-piloto-operator-${Date.now()}@transmetro.gt`,
        operatorRoleRows[0].idRol,
      ],
    )) as { idEmple: string }[];
    operatorId = operatorRows[0]!.idEmple;
    createdEmployeeIds.push(operatorId);
    operatorToken = signToken(operatorId, OPERATOR_ROLE_CODE, [FLOTA_GESTIONAR]);
  });

  afterAll(async () => {
    if (createdUnitIds.length > 0) {
      await dataSource.query(`DELETE FROM tbl_bitacora WHERE entidad_id = ANY($1::bigint[])`, [
        createdUnitIds,
      ]);
      await dataSource.query(
        `DELETE FROM tbl_asignacion_piloto WHERE id_unidad = ANY($1::bigint[])`,
        [createdUnitIds],
      );
      // The pilot self-service location test leaves a tbl_asignacion_unidad
      // row behind (line-assignment POST) — its own FK to tbl_unidad would
      // otherwise block the DELETE below.
      await dataSource.query(
        `DELETE FROM tbl_asignacion_unidad WHERE id_unidad = ANY($1::bigint[])`,
        [createdUnitIds],
      );
      await dataSource.query(`DELETE FROM tbl_unidad WHERE id_unidad = ANY($1::bigint[])`, [
        createdUnitIds,
      ]);
    }
    if (createdEmployeeIds.length > 0) {
      await dataSource.query(
        `DELETE FROM tbl_asignacion_piloto WHERE id_empleado = ANY($1::bigint[])`,
        [createdEmployeeIds],
      );
      await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [
        createdEmployeeIds,
      ]);
    }
    await app.close();
  });

  describe("happy path: assign → reassign → unassign", () => {
    let unitAId: string;
    let unitBId: string;
    let pilot: { id: string; token: string };

    it("POST .../pilot-assignment assigns the pilot and writes an assign_pilot audit row", async () => {
      unitAId = await createUnit();
      pilot = await createPilot();

      const response = await request(app.getHttpServer())
        .post(`/fleet/units/${unitAId}/pilot-assignment`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .send({ idEmpleado: pilot.id })
        .expect(201);

      expect(response.body.idEmpleado).toBe(pilot.id);
      expect(response.body.idUnidad).toBe(unitAId);
      expect(await auditRows(unitAId)).toEqual([{ accion: "assign_pilot", resultado: "EXITOSO" }]);
    });

    it("PATCH .../pilot-assignment on the target unit moves the pilot and writes a reassign_pilot audit row", async () => {
      unitBId = await createUnit();

      const response = await request(app.getHttpServer())
        .patch(`/fleet/units/${unitBId}/pilot-assignment`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .send({ idEmpleado: pilot.id })
        .expect(200);

      expect(response.body.idUnidad).toBe(unitBId);

      const rows = await auditRows(unitBId);
      expect(rows[rows.length - 1]).toEqual({ accion: "reassign_pilot", resultado: "EXITOSO" });

      // unitA's own audit trail is untouched by the move (the row belongs
      // to unitB now; no new row is written against unitA).
      expect(await auditRows(unitAId)).toEqual([{ accion: "assign_pilot", resultado: "EXITOSO" }]);
    });

    it("DELETE .../pilot-assignment removes the assignment and writes an unassign_pilot audit row", async () => {
      await request(app.getHttpServer())
        .delete(`/fleet/units/${unitBId}/pilot-assignment`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(204);

      const rows = await auditRows(unitBId);
      expect(rows[rows.length - 1]).toEqual({ accion: "unassign_pilot", resultado: "EXITOSO" });

      const remaining = (await dataSource.query(
        `SELECT id_asignacion_piloto FROM tbl_asignacion_piloto WHERE id_unidad = $1`,
        [unitBId],
      )) as unknown[];
      expect(remaining).toHaveLength(0);
    });
  });

  it("POST .../pilot-assignment with a non-PILOTO employee returns 409", async () => {
    const unitId = await createUnit();
    const nonPilotId = await createNonPilotEmployee();

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: nonPilotId })
      .expect(409);
  });

  it("POST .../pilot-assignment with a non-existent employee returns 404", async () => {
    const unitId = await createUnit();

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: NON_EXISTENT_ID })
      .expect(404);
  });

  it("POST .../pilot-assignment for a pilot already assigned elsewhere returns 409", async () => {
    const unitAId = await createUnit();
    const unitBId = await createUnit();
    const pilot = await createPilot();

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitAId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilot.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitBId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilot.id })
      .expect(409);
  });

  it("POST .../pilot-assignment on a unit that already has a pilot returns 409", async () => {
    const unitId = await createUnit();
    const pilotA = await createPilot();
    const pilotB = await createPilot();

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilotA.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilotB.id })
      .expect(409);
  });

  it("PATCH .../pilot-assignment to the pilot's current unit returns 409 (no idempotent reassign)", async () => {
    const unitId = await createUnit();
    const pilot = await createPilot();

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilot.id })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilot.id })
      .expect(409);
  });

  it("PATCH .../pilot-assignment is blocked while the pilot's current unit is EN_SERVICIO", async () => {
    const lineUnitId = await createUnit();
    const targetUnitId = await createUnit();
    const pilot = await createPilot();

    await request(app.getHttpServer())
      .post(`/fleet/units/${lineUnitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilot.id })
      .expect(201);

    // Forced directly via SQL: reaching EN_SERVICIO through the API also
    // requires a real line assignment, out of this test's scope.
    await dataSource.query(
      `UPDATE tbl_unidad SET estado_unidad = 'EN_SERVICIO' WHERE id_unidad = $1`,
      [lineUnitId],
    );

    await request(app.getHttpServer())
      .patch(`/fleet/units/${targetUnitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilot.id })
      .expect(409);
  });

  it("DELETE .../pilot-assignment on an EN_SERVICIO unit returns 409", async () => {
    const unitId = await createUnit();
    const pilot = await createPilot();

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ idEmpleado: pilot.id })
      .expect(201);

    await dataSource.query(`UPDATE tbl_unidad SET estado_unidad = 'EN_SERVICIO' WHERE id_unidad = $1`, [
      unitId,
    ]);

    await request(app.getHttpServer())
      .delete(`/fleet/units/${unitId}/pilot-assignment`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(409);
  });

  it("requests without a token are rejected with 401", async () => {
    const unitId = await createUnit();
    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/pilot-assignment`)
      .send({ idEmpleado: "1" })
      .expect(401);
  });

  // ─── CRITICAL TEST (design.md Decision 9) ──────────────────────────────
  // Proves AsignacionPilotoController is registered BEFORE UnidadController
  // in FleetModule, so the static GET /fleet/units/my-unit route resolves
  // to getOwnUnit() and never falls through to UnidadController's dynamic
  // GET /fleet/units/:id (which would otherwise parse "my-unit" as a
  // literal unit id and 404 with the wrong error).
  describe("route collision: GET /fleet/units/my-unit vs GET /fleet/units/:id (Decision 9)", () => {
    it("resolves each pilot to their OWN unit, never the other pilot's or a generic :id 404", async () => {
      const unitOneId = await createUnit();
      const unitTwoId = await createUnit();
      const pilotOne = await createPilot();
      const pilotTwo = await createPilot();
      const unassignedPilot = await createPilot();

      await request(app.getHttpServer())
        .post(`/fleet/units/${unitOneId}/pilot-assignment`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .send({ idEmpleado: pilotOne.id })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/fleet/units/${unitTwoId}/pilot-assignment`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .send({ idEmpleado: pilotTwo.id })
        .expect(201);

      const pilotOneResponse = await request(app.getHttpServer())
        .get("/fleet/units/my-unit")
        .set("Authorization", `Bearer ${pilotOne.token}`)
        .expect(200);
      expect(pilotOneResponse.body.idUnidad).toBe(unitOneId);
      expect(pilotOneResponse.body.idUnidad).not.toBe(unitTwoId);

      const pilotTwoResponse = await request(app.getHttpServer())
        .get("/fleet/units/my-unit")
        .set("Authorization", `Bearer ${pilotTwo.token}`)
        .expect(200);
      expect(pilotTwoResponse.body.idUnidad).toBe(unitTwoId);
      expect(pilotTwoResponse.body.idUnidad).not.toBe(unitOneId);

      // The decisive assertion: if UnidadController's :id route had
      // shadowed this one, the response would be a 404 with a message
      // naming the literal id "my-unit" (UnitNotFound's message shape is
      // `Unidad con ID ${id} no existe.`) instead of a 200 with real unit
      // data. Asserting both — success status AND no "my-unit" substring in
      // any error text — makes the collision failure mode impossible to
      // pass accidentally.
      expect(JSON.stringify(pilotOneResponse.body)).not.toContain("my-unit");

      const unassignedResponse = await request(app.getHttpServer())
        .get("/fleet/units/my-unit")
        .set("Authorization", `Bearer ${unassignedPilot.token}`)
        .expect(404);
      // Must be PilotHasNoUnitAssigned's message ("No hay una unidad
      // asignada actualmente."), never UnitNotFound's ("Unidad con ID
      // my-unit no existe.") — the latter would prove the collision
      // regression.
      expect(unassignedResponse.body.message).not.toContain("my-unit");
      expect(unassignedResponse.body.error).toBe("PilotHasNoUnitAssigned");
    });

    it("GET /fleet/units/:id with a real numeric id still resolves to UnidadController after AsignacionPilotoController is registered first", async () => {
      const unitId = await createUnit();

      const response = await request(app.getHttpServer())
        .get(`/fleet/units/${unitId}`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .expect(200);

      expect(response.body.idUnidad).toBe(unitId);
    });
  });

  describe("pilot self-service", () => {
    it("GET /fleet/units/my-unit returns 404 with a 'no unit assigned' message for an unassigned pilot", async () => {
      const pilot = await createPilot();

      const response = await request(app.getHttpServer())
        .get("/fleet/units/my-unit")
        .set("Authorization", `Bearer ${pilot.token}`)
        .expect(404);

      expect(response.body.error).toBe("PilotHasNoUnitAssigned");
    });

    it("POST /fleet/units/my-unit/location reports the pilot's own unit's location and writes an audit row against that unit", async () => {
      const unitId = await createUnit();
      const pilot = await createPilot();

      const parqueoRows = (await dataSource.query(
        `INSERT INTO tbl_parqueo
           (nombre_parqueo, tipo_parqueo, direccion, latitud, longitud, capacidad_unidades, estado_parqueo)
         VALUES ($1, 'CENTRAL', 'Zona 1', 14.6, -90.5, 100, 'ACTIVO')
         RETURNING id_parqueo AS "idParqueo"`,
        [`E2E Piloto Parqueo ${Date.now()}`],
      )) as { idParqueo: string }[];
      const parqueoId = parqueoRows[0]!.idParqueo;

      const lineaRows = (await dataSource.query(
        `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido, id_parqueo)
         VALUES ($1, 'Línea E2E Piloto', '#0000FF', 'ACTIVA', 'LINEAL', $2)
         RETURNING id_linea AS "idLinea"`,
        // numero_linea is VARCHAR(20) — base-36 keeps the fixture short and
        // unique across runs (same constraint already documented in
        // asignacion-unidad.e2e-spec.ts's createPlaca()).
        [`E2E-PLT-${Math.random().toString(36).slice(2, 10)}`, parqueoId],
      )) as { idLinea: string }[];
      const lineaId = lineaRows[0]!.idLinea;

      const paradaRows = (await dataSource.query(
        `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
         VALUES ($1, 14.6, -90.5, 'ACTIVA')
         RETURNING id_parada AS "idParada"`,
        ["E2E Piloto Parada"],
      )) as { idParada: string }[];
      const paradaId = paradaRows[0]!.idParada;

      const lineaParadaRows = (await dataSource.query(
        `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea)
         VALUES (1, 5, $1, $2)
         RETURNING id_linea_parada AS "idLineaParada"`,
        [paradaId, lineaId],
      )) as { idLineaParada: string }[];
      const lineaParadaId = lineaParadaRows[0]!.idLineaParada;

      try {
        await request(app.getHttpServer())
          .post(`/fleet/units/${unitId}/pilot-assignment`)
          .set("Authorization", `Bearer ${operatorToken}`)
          .send({ idEmpleado: pilot.id })
          .expect(201);

        await request(app.getHttpServer())
          .post(`/fleet/units/${unitId}/line-assignment`)
          .set("Authorization", `Bearer ${operatorToken}`)
          .send({ idLinea: lineaId })
          .expect(201);

        const ownUnit = await request(app.getHttpServer())
          .get("/fleet/units/my-unit")
          .set("Authorization", `Bearer ${pilot.token}`)
          .expect(200);
        expect(ownUnit.body.nombreLinea).toBe("Línea E2E Piloto");

        const stops = await request(app.getHttpServer())
          .get("/fleet/units/my-unit/stops")
          .set("Authorization", `Bearer ${pilot.token}`)
          .expect(200);
        expect(stops.body).toEqual([
          {
            idLineaParada: String(lineaParadaId),
            idParada: String(paradaId),
            nombre: "E2E Piloto Parada",
            orden: 1,
            personasEnParada: 0,
          },
        ]);

        const response = await request(app.getHttpServer())
          .post("/fleet/units/my-unit/location")
          .set("Authorization", `Bearer ${pilot.token}`)
          .send({ idLineaParada: lineaParadaId })
          .expect(200);

        expect(response.body.idLineaParadaActual).toBe(lineaParadaId);

        const rows = (await dataSource.query(
          `SELECT accion, resultado FROM tbl_bitacora
           WHERE modulo = 'fleet' AND entidad_tipo = 'asignacion_unidad' AND entidad_id = $1
           ORDER BY id_bitacora ASC`,
          [unitId],
        )) as { accion: string; resultado: string }[];
        expect(rows[rows.length - 1]).toEqual({ accion: "report_location", resultado: "EXITOSO" });
      } finally {
        // The line-assignment POST above left a tbl_asignacion_unidad row
        // referencing both this unit and id_linea_parada_actual — it must
        // be cleared before tbl_linea_parada/tbl_linea/tbl_unidad, or their
        // FKs block the deletes (tbl_unidad itself is cleaned up in
        // afterAll, which now also clears tbl_asignacion_unidad first).
        await dataSource.query(`DELETE FROM tbl_asignacion_unidad WHERE id_unidad = $1`, [unitId]);
        await dataSource.query(`DELETE FROM tbl_linea_parada WHERE id_linea_parada = $1`, [
          lineaParadaId,
        ]);
        await dataSource.query(`DELETE FROM tbl_parada WHERE id_parada = $1`, [paradaId]);
        await dataSource.query(`DELETE FROM tbl_linea WHERE id_linea = $1`, [lineaId]);
        await dataSource.query(`DELETE FROM tbl_parqueo WHERE id_parqueo = $1`, [parqueoId]);
      }
    });

    it("POST /fleet/units/my-unit/location returns 404 for a pilot with no unit assigned", async () => {
      const pilot = await createPilot();

      await request(app.getHttpServer())
        .post("/fleet/units/my-unit/location")
        .set("Authorization", `Bearer ${pilot.token}`)
        .send({ idLineaParada: NON_EXISTENT_ID })
        .expect(404);
    });

    it("GET /fleet/units/my-unit/stops returns 404 PilotHasNoUnitAssigned for an unassigned pilot", async () => {
      const pilot = await createPilot();

      const response = await request(app.getHttpServer())
        .get("/fleet/units/my-unit/stops")
        .set("Authorization", `Bearer ${pilot.token}`)
        .expect(404);

      expect(response.body.error).toBe("PilotHasNoUnitAssigned");
    });

    it("GET /fleet/units/my-unit/stops returns 409 UnitHasNoLineAssignment when the unit has no line", async () => {
      const unitId = await createUnit();
      const pilot = await createPilot();

      await request(app.getHttpServer())
        .post(`/fleet/units/${unitId}/pilot-assignment`)
        .set("Authorization", `Bearer ${operatorToken}`)
        .send({ idEmpleado: pilot.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/fleet/units/my-unit/stops")
        .set("Authorization", `Bearer ${pilot.token}`)
        .expect(409);

      expect(response.body.error).toBe("UnitHasNoLineAssignment");
    });

    it("GET /fleet/units/my-unit without UNIDAD_ASIGNADA_CONSULTAR permission is rejected with 403", async () => {
      const pilot = await createPilot();
      const tokenWithoutPermission = jwt.sign(
        {
          employeeId: pilot.id,
          email: `e2e-no-perm-${pilot.id}@transmetro.gt`,
          roles: [PILOT_ROLE_CODE],
          permissions: [],
          scope: { role: PILOT_ROLE_CODE, modules: ["passengers"] },
        },
        JWT_SECRET,
        { expiresIn: "12h" },
      );

      await request(app.getHttpServer())
        .get("/fleet/units/my-unit")
        .set("Authorization", `Bearer ${tokenWithoutPermission}`)
        .expect(403);
    });
  });
});
