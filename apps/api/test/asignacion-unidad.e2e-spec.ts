// E2E HTTP test for the AsignacionUnidad line-assignment and location
// endpoints (Slice 3, task 3.3.3).
//
// Follows the same real-app-boot convention as unidad.e2e-spec.ts (full
// AppModule, real Postgres via DATABASE_* env vars) rather than a mocked
// DataSource, because this test exercises real transactions, real FK/CHECK
// constraints on tbl_asignacion_unidad/tbl_linea_parada, and real
// tbl_bitacora audit rows — none of which a mocked DataSource can prove.
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
const NON_EXISTENT_ID = "999999999";

function signToken(employeeId: string): string {
  return jwt.sign(
    {
      employeeId,
      email: "e2e-asignacion-unidad@transmetro.gt",
      roles: [OPERATOR_ROLE_CODE],
      permissions: [FLOTA_GESTIONAR],
      scope: { role: OPERATOR_ROLE_CODE, modules: ["passengers"] },
    },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
}

describe("AsignacionUnidad line-assignment and location (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let token: string;
  let actorEmployeeId: string;
  const createdUnitIds: string[] = [];
  const createdLineaIds: string[] = [];
  const createdParadaIds: string[] = [];
  let parqueoId: string;
  let lineaAId: string;
  let lineaBId: string;
  // tbl_linea_parada row ids (what AsignacionUnidad's idLineaParada refers
  // to — a specific stop position within a line's sequence, not
  // tbl_parada.id_parada directly).
  let lineaParadaB1Id: string;
  let lineaParadaB2Id: string;

  // tbl_unidad.numero_placa is VARCHAR(20) (database/init.sql). The previous
  // fixture built `E2E-ASG-${Date.now()}-${random}` = 25 characters, so
  // POST /fleet/units returned 500 "value too long for type character
  // varying(20)" and every test in this suite cascaded off that failure. Keep
  // the fixture inside the column limit; base-36 keeps it short and unique
  // across runs.
  function createPlaca(): string {
    return `E2E-ASG-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function createUnit(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/fleet/units")
      .set("Authorization", `Bearer ${token}`)
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

  async function auditRows(unitId: string): Promise<{ accion: string; resultado: string }[]> {
    return (await dataSource.query(
      `SELECT accion, resultado FROM tbl_bitacora
       WHERE modulo = 'fleet' AND entidad_tipo = 'asignacion_unidad' AND entidad_id = $1
       ORDER BY id_bitacora ASC`,
      [unitId],
    )) as { accion: string; resultado: string }[];
  }

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
      ["E2E AsignacionUnidad Tester", `e2e-asignacion-unidad-${Date.now()}@transmetro.gt`, role.idRol],
    )) as { idEmple: string }[];
    if (!employeeRows[0]) {
      throw new Error("Failed to insert e2e test employee");
    }
    actorEmployeeId = employeeRows[0].idEmple;
    token = signToken(actorEmployeeId);

    const parqueoRows = (await dataSource.query(
      `INSERT INTO tbl_parqueo
         (nombre_parqueo, tipo_parqueo, direccion, latitud, longitud, capacidad_unidades, estado_parqueo)
       VALUES ($1, 'CENTRAL', 'Zona 1', 14.6, -90.5, 100, 'ACTIVO')
       RETURNING id_parqueo AS "idParqueo"`,
      [`E2E Parqueo ${Date.now()}`],
    )) as { idParqueo: string }[];
    parqueoId = parqueoRows[0]!.idParqueo;

    const lineaRows = (await dataSource.query(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido, id_parqueo)
       VALUES ($1, 'Línea E2E A', '#FF0000', 'ACTIVA', 'LINEAL', $2)
       RETURNING id_linea AS "idLinea"`,
      [`E2E-A-${Date.now()}`, parqueoId],
    )) as { idLinea: string }[];
    lineaAId = lineaRows[0]!.idLinea;
    createdLineaIds.push(lineaAId);

    const lineaBRows = (await dataSource.query(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido, id_parqueo)
       VALUES ($1, 'Línea E2E B', '#00FF00', 'ACTIVA', 'LINEAL', $2)
       RETURNING id_linea AS "idLinea"`,
      [`E2E-B-${Date.now()}`, parqueoId],
    )) as { idLinea: string }[];
    lineaBId = lineaBRows[0]!.idLinea;
    createdLineaIds.push(lineaBId);

    const paradaAId = await insertParada("E2E Parada A1");
    const paradaB1Id = await insertParada("E2E Parada B1");
    const paradaB2Id = await insertParada("E2E Parada B2");

    const lineaParadaA1Rows = (await dataSource.query(
      `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea)
       VALUES (1, 5, $1, $2)
       RETURNING id_linea_parada AS "idLineaParada"`,
      [paradaAId, lineaAId],
    )) as { idLineaParada: string }[];
    void lineaParadaA1Rows;

    const lineaParadaB1Rows = (await dataSource.query(
      `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea)
       VALUES (1, 5, $1, $2)
       RETURNING id_linea_parada AS "idLineaParada"`,
      [paradaB1Id, lineaBId],
    )) as { idLineaParada: string }[];
    lineaParadaB1Id = lineaParadaB1Rows[0]!.idLineaParada;

    const lineaParadaB2Rows = (await dataSource.query(
      `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea)
       VALUES (2, 5, $1, $2)
       RETURNING id_linea_parada AS "idLineaParada"`,
      [paradaB2Id, lineaBId],
    )) as { idLineaParada: string }[];
    lineaParadaB2Id = lineaParadaB2Rows[0]!.idLineaParada;

    async function insertParada(nombre: string): Promise<string> {
      const rows = (await dataSource.query(
        `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
         VALUES ($1, 14.6, -90.5, 'ACTIVA')
         RETURNING id_parada AS "idParada"`,
        [nombre],
      )) as { idParada: string }[];
      const id = rows[0]!.idParada;
      createdParadaIds.push(id);
      return id;
    }
  });

  afterAll(async () => {
    if (createdUnitIds.length > 0) {
      await dataSource.query(`DELETE FROM tbl_bitacora WHERE entidad_id = ANY($1::bigint[])`, [
        createdUnitIds,
      ]);
      await dataSource.query(
        `DELETE FROM tbl_asignacion_unidad WHERE id_unidad = ANY($1::bigint[])`,
        [createdUnitIds],
      );
      await dataSource.query(`DELETE FROM tbl_unidad WHERE id_unidad = ANY($1::bigint[])`, [
        createdUnitIds,
      ]);
    }
    if (createdLineaIds.length > 0) {
      await dataSource.query(`DELETE FROM tbl_linea_parada WHERE id_linea = ANY($1::bigint[])`, [
        createdLineaIds,
      ]);
      await dataSource.query(`DELETE FROM tbl_linea WHERE id_linea = ANY($1::bigint[])`, [
        createdLineaIds,
      ]);
    }
    if (parqueoId) {
      await dataSource.query(`DELETE FROM tbl_parqueo WHERE id_parqueo = $1`, [parqueoId]);
    }
    if (createdParadaIds.length > 0) {
      await dataSource.query(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [
        createdParadaIds,
      ]);
    }
    if (actorEmployeeId) {
      await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = $1`, [actorEmployeeId]);
    }
    await app.close();
  });

  describe("happy path: assign → reassign → report → correct → unassign", () => {
    let unitId: string;

    it("POST .../line-assignment creates the assignment and writes an assign_line audit row", async () => {
      unitId = await createUnit();

      const response = await request(app.getHttpServer())
        .post(`/fleet/units/${unitId}/line-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idLinea: lineaAId })
        .expect(201);

      expect(response.body.idLinea).toBe(lineaAId);
      expect(response.body.idLineaParadaActual).toBeUndefined();

      expect(await auditRows(unitId)).toEqual([{ accion: "assign_line", resultado: "EXITOSO" }]);
    });

    it("PATCH .../line-assignment reassigns the line, clears the last reported stop, and writes a reassign_line audit row", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/fleet/units/${unitId}/line-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idLinea: lineaBId })
        .expect(200);

      expect(response.body.idLinea).toBe(lineaBId);
      expect(response.body.idLineaParadaActual).toBeUndefined();
      expect(response.body.fechaReporteUbicacion).toBeUndefined();

      const rows = await auditRows(unitId);
      expect(rows[rows.length - 1]).toEqual({ accion: "reassign_line", resultado: "EXITOSO" });
    });

    it("POST .../location sets fechaReporteUbicacion server-side and writes a report_location audit row", async () => {
      const response = await request(app.getHttpServer())
        .post(`/fleet/units/${unitId}/location`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idLineaParada: lineaParadaB1Id })
        .expect(200);

      expect(response.body.idLineaParadaActual).toBe(lineaParadaB1Id);
      expect(response.body.fechaReporteUbicacion).toBeDefined();

      const rows = await auditRows(unitId);
      expect(rows[rows.length - 1]).toEqual({ accion: "report_location", resultado: "EXITOSO" });
    });

    it("PATCH .../location corrects the reported stop and writes a correct_location audit row", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/fleet/units/${unitId}/location`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idLineaParada: lineaParadaB2Id })
        .expect(200);

      expect(response.body.idLineaParadaActual).toBe(lineaParadaB2Id);

      const rows = await auditRows(unitId);
      expect(rows[rows.length - 1]).toEqual({ accion: "correct_location", resultado: "EXITOSO" });
    });

    it("DELETE .../line-assignment removes the assignment and writes an unassign_line audit row", async () => {
      await request(app.getHttpServer())
        .delete(`/fleet/units/${unitId}/line-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      const rows = await auditRows(unitId);
      expect(rows[rows.length - 1]).toEqual({ accion: "unassign_line", resultado: "EXITOSO" });

      const remaining = (await dataSource.query(
        `SELECT id_asignacion_unidad FROM tbl_asignacion_unidad WHERE id_unidad = $1`,
        [unitId],
      )) as unknown[];
      expect(remaining).toHaveLength(0);
    });
  });

  it("GET /fleet/units/:id and GET /fleet/units expose the reported stop (id, date, real name) only after a location report", async () => {
    const unitId = await createUnit();
    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/line-assignment`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idLinea: lineaBId })
      .expect(201);

    const keys = ["idLineaParadaActual", "fechaReporteUbicacion", "nombreParadaActual"];
    const findInList = async (): Promise<Record<string, unknown>> => {
      const list = await request(app.getHttpServer())
        .get("/fleet/units")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      const found = (list.body as Record<string, unknown>[]).find((u) => u.idUnidad === unitId);
      expect(found).toBeDefined();
      return found!;
    };

    // Before any report: none of the keys are present.
    const beforeOne = await request(app.getHttpServer())
      .get(`/fleet/units/${unitId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const beforeList = await findInList();
    for (const key of keys) {
      expect(beforeOne.body).not.toHaveProperty(key);
      expect(beforeList).not.toHaveProperty(key);
    }

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/location`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idLineaParada: lineaParadaB1Id })
      .expect(200);

    // The stop's real name straight from the DB, not a fixture literal.
    const nameRows = (await dataSource.query(
      `SELECT p.nombre_parada AS "nombre"
       FROM tbl_linea_parada lp JOIN tbl_parada p ON p.id_parada = lp.id_parada
       WHERE lp.id_linea_parada = $1`,
      [lineaParadaB1Id],
    )) as { nombre: string }[];
    const expectedName = nameRows[0]!.nombre;
    expect(expectedName).toBeTruthy();

    const afterOne = await request(app.getHttpServer())
      .get(`/fleet/units/${unitId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const afterList = await findInList();
    for (const body of [afterOne.body as Record<string, unknown>, afterList]) {
      expect(body.idLineaParadaActual).toBe(lineaParadaB1Id);
      expect(body.fechaReporteUbicacion).toBeDefined();
      expect(body.nombreParadaActual).toBe(expectedName);
    }
  });

  it("POST .../line-assignment with a non-existent line returns 404", async () => {
    const unitId = await createUnit();

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/line-assignment`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idLinea: NON_EXISTENT_ID })
      .expect(404);
  });

  it("POST .../location with a non-existent stop returns 404", async () => {
    const unitId = await createUnit();
    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/line-assignment`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idLinea: lineaAId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/location`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idLineaParada: NON_EXISTENT_ID })
      .expect(404);
  });

  it("POST .../location with a stop that belongs to a different line returns 409", async () => {
    const unitId = await createUnit();
    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/line-assignment`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idLinea: lineaAId })
      .expect(201);

    // lineaParadaB1Id belongs to lineaB, but this unit is assigned to lineaA.
    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/location`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idLineaParada: lineaParadaB1Id })
      .expect(409);
  });

  it("DELETE .../line-assignment on an EN_SERVICIO unit returns 409", async () => {
    const unitId = await createUnit();
    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/line-assignment`)
      .set("Authorization", `Bearer ${token}`)
      .send({ idLinea: lineaAId })
      .expect(201);

    // Forced directly via SQL: reaching EN_SERVICIO through the API also
    // requires a pilot assignment (Slice 4), out of this test's scope.
    await dataSource.query(`UPDATE tbl_unidad SET estado_unidad = 'EN_SERVICIO' WHERE id_unidad = $1`, [
      unitId,
    ]);

    await request(app.getHttpServer())
      .delete(`/fleet/units/${unitId}/line-assignment`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
  });

  it("requests without a token are rejected with 401", async () => {
    const unitId = await createUnit();
    await request(app.getHttpServer())
      .post(`/fleet/units/${unitId}/line-assignment`)
      .send({ idLinea: lineaAId })
      .expect(401);
  });

  // Task 4.3.4: now that both AsignacionUnidadService AND
  // AsignacionPilotoService exist (Slice 4), this is the first point where
  // the full cross-cutting EN_SERVICIO rule (design.md "Unit State
  // Transitions and EN_SERVICIO Validation" — a unit may transition to
  // EN_SERVICIO only with BOTH an active line and an active pilot
  // assignment) can be exercised end to end against a real database.
  // tasks.md names `asignacion-unidad.controller.spec.ts` for this task,
  // but that file is a mocked-service UNIT spec (no real DB, no real
  // UnidadService.update); this e2e file is the one that actually boots
  // AppModule against Postgres and can prove the real cross-service rule,
  // so the matrix lives here instead.
  describe("EN_SERVICIO validation across both assignments (task 4.3.4)", () => {
    let pilotRoleId: string;
    const matrixEmployeeIds: string[] = [];

    async function createPilot(): Promise<string> {
      const rows = (await dataSource.query(
        `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
         VALUES ($1, 'ACTIVO', $2, $3)
         RETURNING id_emple AS "idEmple"`,
        [
          "E2E EN_SERVICIO Pilot",
          `e2e-en-servicio-piloto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@transmetro.gt`,
          pilotRoleId,
        ],
      )) as { idEmple: string }[];
      const id = rows[0]!.idEmple;
      matrixEmployeeIds.push(id);
      return id;
    }

    beforeAll(async () => {
      const pilotRoleRows = (await dataSource.query(
        `SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = 'PILOTO'`,
      )) as { idRol: string }[];
      if (!pilotRoleRows[0]) {
        throw new Error("Seed role PILOTO not found in tbl_rol");
      }
      pilotRoleId = pilotRoleRows[0].idRol;
    });

    afterAll(async () => {
      if (matrixEmployeeIds.length > 0) {
        await dataSource.query(
          `DELETE FROM tbl_asignacion_piloto WHERE id_empleado = ANY($1::bigint[])`,
          [matrixEmployeeIds],
        );
        await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [
          matrixEmployeeIds,
        ]);
      }
    });

    it("1. unit with no assignments: PATCH estadoUnidad=EN_SERVICIO is rejected with 409", async () => {
      const unitId = await createUnit();

      await request(app.getHttpServer())
        .patch(`/fleet/units/${unitId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estadoUnidad: "EN_SERVICIO" })
        .expect(409);
    });

    it("2. unit with a line but no pilot: PATCH estadoUnidad=EN_SERVICIO is rejected with 409", async () => {
      const unitId = await createUnit();
      await request(app.getHttpServer())
        .post(`/fleet/units/${unitId}/line-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idLinea: lineaAId })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/fleet/units/${unitId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estadoUnidad: "EN_SERVICIO" })
        .expect(409);
    });

    it("3. unit with both a line and a pilot: PATCH estadoUnidad=EN_SERVICIO is accepted (200)", async () => {
      const unitId = await createUnit();
      const pilotId = await createPilot();
      await request(app.getHttpServer())
        .post(`/fleet/units/${unitId}/line-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idLinea: lineaAId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/fleet/units/${unitId}/pilot-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idEmpleado: pilotId })
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/fleet/units/${unitId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estadoUnidad: "EN_SERVICIO" })
        .expect(200);

      expect(response.body.estadoUnidad).toBe("EN_SERVICIO");
    });

    it("4+5+6. once EN_SERVICIO: both unassigns are blocked (409); after returning to DISPONIBLE, both unassigns succeed (200/204)", async () => {
      const unitId = await createUnit();
      const pilotId = await createPilot();
      await request(app.getHttpServer())
        .post(`/fleet/units/${unitId}/line-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idLinea: lineaAId })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/fleet/units/${unitId}/pilot-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .send({ idEmpleado: pilotId })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/fleet/units/${unitId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estadoUnidad: "EN_SERVICIO" })
        .expect(200);

      // 4. DELETE line-assignment is blocked while EN_SERVICIO.
      await request(app.getHttpServer())
        .delete(`/fleet/units/${unitId}/line-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);

      // 5. DELETE pilot-assignment is blocked while EN_SERVICIO.
      await request(app.getHttpServer())
        .delete(`/fleet/units/${unitId}/pilot-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .expect(409);

      // 6. Transition back to DISPONIBLE, then both unassigns succeed.
      await request(app.getHttpServer())
        .patch(`/fleet/units/${unitId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estadoUnidad: "DISPONIBLE" })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/fleet/units/${unitId}/line-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/fleet/units/${unitId}/pilot-assignment`)
        .set("Authorization", `Bearer ${token}`)
        .expect(204);
    });
  });
});
