// ============================================================================
// E2E for odd/tasks/alert-line-scoping.md (T4), against real Postgres.
//
// Reproduces the reported bug: a station shared by two lines, whose operator
// kept receiving alerts of a line after the station's lines changed. Proves:
//   - S1: a pilot still cannot send to a station outside their unit's line.
//   - S3/S7: the alert stores and returns the unit's line at creation time,
//     and keeps it when the unit later changes line.
//   - S4/S6: the operator sees only alerts from the station's ACTIVA lines,
//     gets those lines, and can filter by one of them server side.
//   - S5: an alert from a line the station no longer has is 404 on PATCH.
//   - S8: the central view groups by the stored line.
//   - S11: a station can only be linked to a line whose route stops there.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Requires
// apps/api/.env exported and database/init.sql applied. Everything created
// here is removed in afterAll.
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

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";

type AlertBody = { idAlerta: string; linea: { idLinea: string } | null };

describe("Alert line scoping (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const runTag = `E2E-LNS-${Date.now()}`;
  const short = runTag.slice(-12);
  const ids = {
    employees: [] as string[],
    paradas: [] as string[],
    estaciones: [] as string[],
    lineas: [] as string[],
    unidades: [] as string[],
  };
  let lineA = "";
  let lineB = "";
  let shared = ""; // station on both routes, linked to A and B
  let onlyB = ""; // station on B's route only, linked to B
  let unlinked = ""; // station on A's route only, not linked to any line
  let pilotAToken = "";
  let pilotBToken = "";
  let operatorToken = "";
  let centralToken = "";
  let adminToken = "";
  let unitA = "";
  let alertFromA = "";
  let alertFromB = "";

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await dataSource.query(sql, params)) as T[];
  }

  async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
    const [row] = await rows<T>(sql, params);
    if (!row) throw new Error(`No row for: ${sql}`);
    return row;
  }

  async function createEmployee(roleCode: string, suffix: string): Promise<{ id: string; token: string }> {
    const role = await one<{ idRol: string }>(`SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`, [roleCode]);
    const email = `${runTag.toLowerCase()}-${suffix}@transmetro.gt`;
    const emp = await one<{ id: string }>(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, 'ACTIVO', $2, $3) RETURNING id_emple AS "id"`,
      [`${runTag} ${suffix}`, email, role.idRol],
    );
    const id = String(emp.id);
    ids.employees.push(id);
    const permissions = (
      await rows<{ codigo: string }>(
        `SELECT p.codigo_permiso AS "codigo" FROM tbl_rol r
         JOIN tbl_rol_permiso rp ON rp.id_rol = r.id_rol
         JOIN tbl_permiso p ON p.id_permiso = rp.id_permiso WHERE r.codigo = $1`,
        [roleCode],
      )
    ).map((r) => r.codigo);
    const token = jwt.sign(
      { employeeId: id, email, roles: [roleCode], permissions, scope: { role: roleCode, modules: [] } },
      JWT_SECRET,
      { expiresIn: "12h" },
    );
    return { id, token };
  }

  async function createLine(suffix: string): Promise<string> {
    const linea = await one<{ id: string }>(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido)
       VALUES ($1, $2, '#FF6600', 'ACTIVA', 'LINEAL') RETURNING id_linea AS "id"`,
      [`${short}${suffix}`, `${runTag} Línea ${suffix}`],
    );
    ids.lineas.push(String(linea.id));
    return String(linea.id);
  }

  async function createStation(name: string): Promise<{ parada: string; estacion: string }> {
    const parada = await one<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA') RETURNING id_parada AS "id"`,
      [`${runTag} ${name}`],
    );
    ids.paradas.push(String(parada.id));
    const estacion = await one<{ id: string }>(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA', $2) RETURNING id_estacion AS "id"`,
      [`${runTag} Estación ${name}`, parada.id],
    );
    ids.estaciones.push(String(estacion.id));
    return { parada: String(parada.id), estacion: String(estacion.id) };
  }

  async function route(linea: string, paradas: string[]): Promise<void> {
    for (const [orden, parada] of paradas.entries()) {
      await dataSource.query(
        `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea) VALUES ($1, 3, $2, $3)`,
        [orden + 1, parada, linea],
      );
    }
  }

  async function link(linea: string, estacion: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO tbl_estacion_linea (id_linea, id_estacion, tipo_punto, estado_asignacion)
       VALUES ($1, $2, 'PRINCIPAL', 'ACTIVA')`,
      [linea, estacion],
    );
  }

  async function createUnitWithPilot(linea: string, suffix: string): Promise<{ unidad: string; token: string }> {
    const unidad = await one<{ id: string }>(
      `INSERT INTO tbl_unidad (numero_placa, marca, modelo, anio, capacidad_pasajeros, estado_unidad)
       VALUES ($1, 'Volvo', 'B8R', 2022, 120, 'DISPONIBLE') RETURNING id_unidad AS "id"`,
      [`${short}${suffix}`],
    );
    ids.unidades.push(String(unidad.id));
    await dataSource.query(
      `INSERT INTO tbl_asignacion_unidad (fecha_asignacion, id_unidad, id_linea) VALUES (NOW(), $1, $2)`,
      [unidad.id, linea],
    );
    const pilot = await createEmployee("PILOTO", `pilot${suffix}`);
    await dataSource.query(
      `INSERT INTO tbl_asignacion_piloto (fecha_asignacion, id_empleado, id_unidad) VALUES (NOW(), $1, $2)`,
      [pilot.id, unidad.id],
    );
    return { unidad: String(unidad.id), token: pilot.token };
  }

  const api = () => request(app.getHttpServer());
  const inbox = (query = "") =>
    api().get(`/operations/alerts/my-station${query}`).set("Authorization", `Bearer ${operatorToken}`).expect(200);
  const send = (token: string, idEstacionDestino: string) =>
    api()
      .post("/operations/alerts")
      .set("Authorization", `Bearer ${token}`)
      .send({ tipoAlerta: "RETRASO", idEstacionDestino });
  const storedState = async (idAlerta: string) =>
    one<{ estado: string; historial: string }>(
      `SELECT a.estado_alerta AS "estado",
              (SELECT COUNT(*) FROM tbl_historial_estado h WHERE h.id_alerta = a.id_alerta)::text AS "historial"
         FROM tbl_alerta a WHERE a.id_alerta = $1`,
      [idAlerta],
    );
  const alertCount = async () =>
    Number(
      (await one<{ n: string }>(`SELECT COUNT(*) AS "n" FROM tbl_alerta WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]))
        .n,
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    lineA = await createLine("A");
    lineB = await createLine("B");
    const s = await createStation("Compartida");
    const b = await createStation("SoloB");
    const u = await createStation("SinVincular");
    shared = s.estacion;
    onlyB = b.estacion;
    unlinked = u.estacion;
    await route(lineA, [s.parada, u.parada]);
    await route(lineB, [s.parada, b.parada]);
    await link(lineA, shared);
    await link(lineB, shared);
    await link(lineB, onlyB);

    ({ unidad: unitA, token: pilotAToken } = await createUnitWithPilot(lineA, "A"));
    ({ token: pilotBToken } = await createUnitWithPilot(lineB, "B"));

    const operator = await createEmployee("OPERADOR_ESTACION", "op");
    operatorToken = operator.token;
    await dataSource.query(
      `INSERT INTO tbl_asignacion_estacion (fecha_asignacion, estado_asignacion, id_empleado, id_estacion)
       VALUES (NOW(), 'ACTIVA', $1, $2)`,
      [operator.id, shared],
    );
    ({ token: centralToken } = await createEmployee("OPERADOR_CENTRAL", "central"));
    ({ token: adminToken } = await createEmployee("ADMINISTRADOR_SISTEMA", "admin"));
  });

  afterAll(async () => {
    if (dataSource) {
      const q = (sql: string, params: unknown[]) => dataSource.query(sql, params);
      if (ids.unidades.length) {
        await q(
          `DELETE FROM tbl_historial_estado WHERE id_alerta IN (SELECT id_alerta FROM tbl_alerta WHERE id_unidad = ANY($1::bigint[]))`,
          [ids.unidades],
        );
        await q(`DELETE FROM tbl_alerta WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
        await q(`DELETE FROM tbl_asignacion_piloto WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
        await q(`DELETE FROM tbl_asignacion_unidad WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
        await q(`DELETE FROM tbl_unidad WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
      }
      if (ids.employees.length) {
        await q(`DELETE FROM tbl_asignacion_estacion WHERE id_empleado = ANY($1::bigint[])`, [ids.employees]);
      }
      if (ids.lineas.length) {
        await q(`DELETE FROM tbl_estacion_linea WHERE id_linea = ANY($1::bigint[])`, [ids.lineas]);
        await q(`DELETE FROM tbl_linea_parada WHERE id_linea = ANY($1::bigint[])`, [ids.lineas]);
      }
      if (ids.estaciones.length) await q(`DELETE FROM tbl_estacion WHERE id_estacion = ANY($1::bigint[])`, [ids.estaciones]);
      if (ids.paradas.length) await q(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [ids.paradas]);
      if (ids.lineas.length) await q(`DELETE FROM tbl_linea WHERE id_linea = ANY($1::bigint[])`, [ids.lineas]);
      if (ids.employees.length) {
        // Alert sends and state changes write audit rows authored by these employees.
        await q(`DELETE FROM tbl_bitacora WHERE id_empleado = ANY($1::bigint[])`, [ids.employees]);
        await q(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [ids.employees]);
      }
    }
    if (app) await app.close();
  });

  it("S1: a pilot of line A cannot send to a station that only line B serves (400, nothing stored)", async () => {
    const res = await send(pilotAToken, onlyB).expect(400);

    expect(res.body.error).toBe("DestinationNotOnLine");
    expect(await alertCount()).toBe(0);
  });

  it("S3/S7: each alert to the shared station stores and returns the line it was sent from", async () => {
    const a = await send(pilotAToken, shared).expect(201);
    const b = await send(pilotBToken, shared).expect(201);
    alertFromA = a.body.idAlerta;
    alertFromB = b.body.idAlerta;

    expect(a.body.linea).toEqual({ idLinea: lineA, numeroLinea: `${short}A`, nombreLinea: `${runTag} Línea A` });
    expect(b.body.linea).toEqual({ idLinea: lineB, numeroLinea: `${short}B`, nombreLinea: `${runTag} Línea B` });
    const stored = await rows<{ id: string; linea: string }>(
      `SELECT id_alerta::text AS "id", id_linea::text AS "linea" FROM tbl_alerta WHERE id_alerta = ANY($1::bigint[]) ORDER BY id_alerta`,
      [[alertFromA, alertFromB]],
    );
    expect(stored).toEqual([
      { id: alertFromA, linea: lineA },
      { id: alertFromB, linea: lineB },
    ]);
  });

  it("S4/S6: the operator of the shared station gets both lines and both alerts", async () => {
    const res = await inbox();

    expect(res.body.station.idEstacion).toBe(shared);
    expect(res.body.lineas).toEqual([
      { idLinea: lineA, numeroLinea: `${short}A`, nombreLinea: `${runTag} Línea A` },
      { idLinea: lineB, numeroLinea: `${short}B`, nombreLinea: `${runTag} Línea B` },
    ]);
    expect(res.body.alerts.map((x: AlertBody) => [x.idAlerta, x.linea?.idLinea])).toEqual([
      [alertFromB, lineB],
      [alertFromA, lineA],
    ]);
  });

  it("S6: filtering by one line returns only that line's alerts; a foreign line returns none", async () => {
    const onlyA = await inbox(`?idLinea=${lineA}`);
    expect(onlyA.body.alerts.map((x: AlertBody) => x.idAlerta)).toEqual([alertFromA]);
    expect(onlyA.body.lineas).toHaveLength(2);

    const foreign = await inbox("?idLinea=999999999999");
    expect(foreign.body.alerts).toEqual([]);
    expect(foreign.body.lineas).toHaveLength(2);
  });

  it("S3/S8: a unit that later changes line keeps its old alert under the original line", async () => {
    await dataSource.query(`UPDATE tbl_asignacion_unidad SET id_linea = $1 WHERE id_unidad = $2`, [lineB, unitA]);

    const res = await inbox(`?idLinea=${lineA}`);
    expect(res.body.alerts.map((x: AlertBody) => x.idAlerta)).toEqual([alertFromA]);

    const central = await api().get("/operations/alerts/central").set("Authorization", `Bearer ${centralToken}`).expect(200);
    const group = (id: string) =>
      (central.body.lineas as { idLinea: string | null; estaciones: { unidades: { alerts: AlertBody[] }[] }[] }[])
        .find((l) => l.idLinea === id)
        ?.estaciones.flatMap((e) => e.unidades.flatMap((u) => u.alerts.map((x) => x.idAlerta)));
    expect(group(lineA)).toEqual([alertFromA]);
    expect(group(lineB)).toEqual([alertFromB]);

    await dataSource.query(`UPDATE tbl_asignacion_unidad SET id_linea = $1 WHERE id_unidad = $2`, [lineA, unitA]);
  });

  it("S2/S4: after line B is deactivated on the station, its alerts disappear for the operator", async () => {
    await dataSource.query(
      `UPDATE tbl_estacion_linea SET estado_asignacion = 'INACTIVA' WHERE id_linea = $1 AND id_estacion = $2`,
      [lineB, shared],
    );

    const res = await inbox();
    expect(res.body.lineas.map((l: { idLinea: string }) => l.idLinea)).toEqual([lineA]);
    expect(res.body.alerts.map((x: AlertBody) => x.idAlerta)).toEqual([alertFromA]);

    const filtered = await inbox(`?idLinea=${lineB}`);
    expect(filtered.body.alerts).toEqual([]);
  });

  it("S5: the operator cannot answer the alert of the deactivated line (404, nothing changes)", async () => {
    await api()
      .patch(`/operations/alerts/${alertFromB}/status`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ estado: "RECIBIDA" })
      .expect(404);

    expect(await storedState(alertFromB)).toEqual({ estado: "PENDIENTE", historial: "0" });
  });

  it("S5: the operator still answers the alert of the remaining line", async () => {
    await api()
      .patch(`/operations/alerts/${alertFromA}/status`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .send({ estado: "RECIBIDA" })
      .expect(200);

    expect(await storedState(alertFromA)).toEqual({ estado: "RECIBIDA", historial: "1" });
  });

  it("S11: available lines are the route lines not linked yet", async () => {
    const forUnlinked = await api()
      .get(`/infrastructure/stations/${unlinked}/lines/available`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(forUnlinked.body).toEqual([{ idLinea: lineA, numeroLinea: `${short}A`, nombreLinea: `${runTag} Línea A` }]);

    const forShared = await api()
      .get(`/infrastructure/stations/${shared}/lines/available`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    expect(forShared.body).toEqual([]);
  });

  it("S11: linking a line whose route does not stop at the station is 400 and stores nothing", async () => {
    const res = await api()
      .post(`/infrastructure/stations/${unlinked}/lines`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ idLinea: lineB, tipoPunto: "PRINCIPAL" })
      .expect(400);

    expect(res.body.error).toBe("ESTACION_LINEA_NOT_ON_ROUTE");
    const n = await one<{ n: string }>(`SELECT COUNT(*) AS "n" FROM tbl_estacion_linea WHERE id_estacion = $1`, [unlinked]);
    expect(Number(n.n)).toBe(0);
  });

  it("S11: station-line routes still require INFRAESTRUCTURA_GESTIONAR (403 for an operator)", async () => {
    await api()
      .get(`/infrastructure/stations/${unlinked}/lines/available`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(403);
  });
});
