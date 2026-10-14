// ============================================================================
// E2E for odd/tasks/operational-alerts.md (T4), against real Postgres.
//
// Unit specs mock every query, so only this suite proves with the real schema:
//   - S2: destinations are the ACTIVA stations of the unit's line, with the
//     suggestion computed from the last reported stop; other stations are 400.
//   - S6: POST stores a PENDIENTE UNIDAD -> ESTACION row with the unit and the
//     author derived from the token.
//   - S7/S8: only the destination station's operator sees and moves the alert,
//     forward only, writing one tbl_historial_estado row per change.
//   - S10: permissions are enforced server side.
//   - S12-S14: central users (OPERADOR_CENTRAL, ADMINISTRADOR_SISTEMA) see
//     every station's alerts grouped line -> station -> unit and advance any
//     of them with the same rules and history.
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

describe("Operational alerts (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const runTag = `E2E-ALR-${Date.now()}`;
  const ids = {
    employees: [] as string[],
    paradas: [] as string[],
    estaciones: [] as string[],
    linea: "",
    unidad: "",
  };
  let pilotId = "";
  let op1Id = "";
  let op2Id = "";
  let pilotToken = "";
  let op1Token = "";
  let op2Token = "";
  let centralId = "";
  let centralToken = "";
  let adminToken = "";
  let centralAlertId = "";
  let station1 = "";
  let station3 = "";
  let stationOffLine = "";
  let alertId = "";

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

  async function createStop(name: string, withStation: boolean): Promise<{ parada: string; estacion?: string }> {
    const parada = await one<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA') RETURNING id_parada AS "id"`,
      [`${runTag} ${name}`],
    );
    ids.paradas.push(String(parada.id));
    if (!withStation) return { parada: String(parada.id) };
    const estacion = await one<{ id: string }>(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA', $2) RETURNING id_estacion AS "id"`,
      [`${runTag} Estación ${name}`, parada.id],
    );
    ids.estaciones.push(String(estacion.id));
    return { parada: String(parada.id), estacion: String(estacion.id) };
  }

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    ({ id: pilotId, token: pilotToken } = await createEmployee("PILOTO", "pilot"));
    ({ id: op1Id, token: op1Token } = await createEmployee("OPERADOR_ESTACION", "op1"));
    ({ id: op2Id, token: op2Token } = await createEmployee("OPERADOR_ESTACION", "op2"));
    ({ id: centralId, token: centralToken } = await createEmployee("OPERADOR_CENTRAL", "central"));
    ({ token: adminToken } = await createEmployee("ADMINISTRADOR_SISTEMA", "admin"));

    const linea = await one<{ id: string }>(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido)
       VALUES ($1, $2, '#FF6600', 'ACTIVA', 'LINEAL') RETURNING id_linea AS "id"`,
      [runTag.slice(-12), `${runTag} Línea`],
    );
    ids.linea = String(linea.id);

    // Route: P1 (station) -> P2 (plain stop, where the unit is) -> P3 (station).
    const p1 = await createStop("P1", true);
    const p2 = await createStop("P2", false);
    const p3 = await createStop("P3", true);
    const off = await createStop("Fuera", true);
    station1 = p1.estacion!;
    station3 = p3.estacion!;
    stationOffLine = off.estacion!;

    const linePositions: string[] = [];
    for (const [orden, parada] of [p1.parada, p2.parada, p3.parada].entries()) {
      const lp = await one<{ id: string }>(
        `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea)
         VALUES ($1, 3, $2, $3) RETURNING id_linea_parada AS "id"`,
        [orden + 1, parada, ids.linea],
      );
      linePositions.push(String(lp.id));
    }
    for (const estacion of [station1, station3]) {
      await dataSource.query(
        `INSERT INTO tbl_estacion_linea (id_linea, id_estacion, tipo_punto, estado_asignacion)
         VALUES ($1, $2, 'PRINCIPAL', 'ACTIVA')`,
        [ids.linea, estacion],
      );
    }

    const unidad = await one<{ id: string }>(
      `INSERT INTO tbl_unidad (numero_placa, marca, modelo, anio, capacidad_pasajeros, estado_unidad)
       VALUES ($1, 'Volvo', 'B8R', 2022, 120, 'DISPONIBLE') RETURNING id_unidad AS "id"`,
      [runTag.slice(-15)],
    );
    ids.unidad = String(unidad.id);
    await dataSource.query(
      `INSERT INTO tbl_asignacion_unidad (fecha_asignacion, id_unidad, id_linea, id_linea_parada_actual, fecha_reporte_ubicacion)
       VALUES (NOW(), $1, $2, $3, NOW())`,
      [ids.unidad, ids.linea, linePositions[1]],
    );
    await dataSource.query(
      `INSERT INTO tbl_asignacion_piloto (fecha_asignacion, id_empleado, id_unidad) VALUES (NOW(), $1, $2)`,
      [pilotId, ids.unidad],
    );
    await dataSource.query(
      `INSERT INTO tbl_asignacion_estacion (fecha_asignacion, estado_asignacion, id_empleado, id_estacion)
       VALUES (NOW(), 'ACTIVA', $1, $2), (NOW(), 'ACTIVA', $3, $4)`,
      [op1Id, station1, op2Id, station3],
    );
  });

  afterAll(async () => {
    if (dataSource) {
      const q = (sql: string, params: unknown[]) => dataSource.query(sql, params);
      if (ids.unidad) {
        await q(`DELETE FROM tbl_historial_estado WHERE id_alerta IN (SELECT id_alerta FROM tbl_alerta WHERE id_unidad = $1)`, [ids.unidad]);
        await q(`DELETE FROM tbl_alerta WHERE id_unidad = $1`, [ids.unidad]);
        await q(`DELETE FROM tbl_asignacion_piloto WHERE id_unidad = $1`, [ids.unidad]);
        await q(`DELETE FROM tbl_asignacion_unidad WHERE id_unidad = $1`, [ids.unidad]);
        await q(`DELETE FROM tbl_unidad WHERE id_unidad = $1`, [ids.unidad]);
      }
      if (ids.employees.length) {
        await q(`DELETE FROM tbl_asignacion_estacion WHERE id_empleado = ANY($1::bigint[])`, [ids.employees]);
      }
      if (ids.linea) {
        await q(`DELETE FROM tbl_estacion_linea WHERE id_linea = $1`, [ids.linea]);
        await q(`DELETE FROM tbl_linea_parada WHERE id_linea = $1`, [ids.linea]);
      }
      if (ids.estaciones.length) await q(`DELETE FROM tbl_estacion WHERE id_estacion = ANY($1::bigint[])`, [ids.estaciones]);
      if (ids.paradas.length) await q(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [ids.paradas]);
      if (ids.linea) await q(`DELETE FROM tbl_linea WHERE id_linea = $1`, [ids.linea]);
      if (ids.employees.length) await q(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [ids.employees]);
    }
    if (app) await app.close();
  });

  const alertCount = async () =>
    Number((await one<{ n: string }>(`SELECT COUNT(*) AS "n" FROM tbl_alerta WHERE id_unidad = $1`, [ids.unidad])).n);
  const historyCount = async () =>
    Number(
      (await one<{ n: string }>(`SELECT COUNT(*) AS "n" FROM tbl_historial_estado WHERE id_alerta = $1`, [alertId])).n,
    );

  it("rejects unauthenticated requests with 401", async () => {
    await api().get("/operations/alerts/sent").expect(401);
  });

  it("S2: lists the ACTIVA stations of the unit's line and suggests the one ahead on a tie", async () => {
    const res = await api()
      .get("/operations/alerts/my-unit/destinations")
      .set("Authorization", `Bearer ${pilotToken}`)
      .expect(200);

    expect(res.body.unidad.idUnidad).toBe(ids.unidad);
    expect(res.body.linea.idLinea).toBe(ids.linea);
    expect(res.body.destinations).toEqual([
      { idEstacion: station1, nombreEstacion: `${runTag} Estación P1`, orden: 1, suggested: false },
      { idEstacion: station3, nombreEstacion: `${runTag} Estación P3`, orden: 3, suggested: true },
    ]);
  });

  it("S2: rejects a destination outside the unit's line with 400 and stores nothing", async () => {
    const res = await api()
      .post("/operations/alerts")
      .set("Authorization", `Bearer ${pilotToken}`)
      .send({ tipoAlerta: "ACCIDENTE", idEstacionDestino: stationOffLine })
      .expect(400);

    expect(res.body.error).toBe("DestinationNotOnLine");
    expect(await alertCount()).toBe(0);
  });

  it("S3: rejects a type outside the catalog with 400 and stores nothing", async () => {
    await api()
      .post("/operations/alerts")
      .set("Authorization", `Bearer ${pilotToken}`)
      .send({ tipoAlerta: "OTRO", idEstacionDestino: station1 })
      .expect(400);

    expect(await alertCount()).toBe(0);
  });

  it("S6: stores a PENDIENTE unit -> station alert with the derived unit and author", async () => {
    const res = await api()
      .post("/operations/alerts")
      .set("Authorization", `Bearer ${pilotToken}`)
      .send({ tipoAlerta: "ACCIDENTE", idEstacionDestino: station1 })
      .expect(201);
    alertId = res.body.idAlerta;

    expect(res.body).toMatchObject({
      tipoAlerta: "ACCIDENTE",
      tipoOrigen: "UNIDAD",
      tipoDestino: "ESTACION",
      estadoAlerta: "PENDIENTE",
      unidad: { idUnidad: ids.unidad },
      estacionDestino: { idEstacion: station1 },
      autor: { idEmpleado: pilotId, nombre: `${runTag} pilot` },
    });
    const stored = await one<Record<string, string>>(
      `SELECT tipo_origen, tipo_destino, estado_alerta, id_unidad::text AS id_unidad,
              id_estacion_destino::text AS id_estacion_destino, id_empleado::text AS id_empleado
         FROM tbl_alerta WHERE id_alerta = $1`,
      [alertId],
    );
    expect(stored).toEqual({
      tipo_origen: "UNIDAD",
      tipo_destino: "ESTACION",
      estado_alerta: "PENDIENTE",
      id_unidad: ids.unidad,
      id_estacion_destino: station1,
      id_empleado: pilotId,
    });
    expect(await alertCount()).toBe(1);
  });

  it("S9: the pilot sees the alert in their sent list", async () => {
    const res = await api().get("/operations/alerts/sent").set("Authorization", `Bearer ${pilotToken}`).expect(200);
    expect(res.body.map((a: { idAlerta: string }) => a.idAlerta)).toEqual([alertId]);
  });

  it("S7: only the destination station's operator receives the alert", async () => {
    const mine = await api().get("/operations/alerts/my-station").set("Authorization", `Bearer ${op1Token}`).expect(200);
    expect(mine.body.station.idEstacion).toBe(station1);
    expect(mine.body.alerts.map((a: { idAlerta: string }) => a.idAlerta)).toEqual([alertId]);

    const other = await api().get("/operations/alerts/my-station").set("Authorization", `Bearer ${op2Token}`).expect(200);
    expect(other.body.station.idEstacion).toBe(station3);
    expect(other.body.alerts).toEqual([]);
  });

  it("S8: another station's operator cannot move the alert (404, nothing changes)", async () => {
    await api()
      .patch(`/operations/alerts/${alertId}/status`)
      .set("Authorization", `Bearer ${op2Token}`)
      .send({ estado: "RECIBIDA" })
      .expect(404);

    const stored = await one<{ estado: string }>(`SELECT estado_alerta AS "estado" FROM tbl_alerta WHERE id_alerta = $1`, [alertId]);
    expect(stored.estado).toBe("PENDIENTE");
    expect(await historyCount()).toBe(0);
  });

  it("S8: the operator moves it forward and one history row is written", async () => {
    const res = await api()
      .patch(`/operations/alerts/${alertId}/status`)
      .set("Authorization", `Bearer ${op1Token}`)
      .send({ estado: "RECIBIDA", observacion: "Unidad en camino" })
      .expect(200);
    expect(res.body.estadoAlerta).toBe("RECIBIDA");

    const history = await rows<Record<string, string>>(
      `SELECT estado_anterior, estado_nuevo, observacion, id_empleado::text AS id_empleado
         FROM tbl_historial_estado WHERE id_alerta = $1`,
      [alertId],
    );
    expect(history).toEqual([
      { estado_anterior: "PENDIENTE", estado_nuevo: "RECIBIDA", observacion: "Unidad en camino", id_empleado: op1Id },
    ]);
  });

  it("S8: same or earlier states are 409 and change nothing", async () => {
    const res = await api()
      .patch(`/operations/alerts/${alertId}/status`)
      .set("Authorization", `Bearer ${op1Token}`)
      .send({ estado: "RECIBIDA" })
      .expect(409);
    expect(res.body.error).toBe("InvalidAlertTransition");

    await api()
      .patch(`/operations/alerts/${alertId}/status`)
      .set("Authorization", `Bearer ${op1Token}`)
      .send({ estado: "PENDIENTE" })
      .expect(400);

    const stored = await one<{ estado: string }>(`SELECT estado_alerta AS "estado" FROM tbl_alerta WHERE id_alerta = $1`, [alertId]);
    expect(stored.estado).toBe("RECIBIDA");
    expect(await historyCount()).toBe(1);
  });

  it("S8: skipping forward to RESUELTA is allowed", async () => {
    await api()
      .patch(`/operations/alerts/${alertId}/status`)
      .set("Authorization", `Bearer ${op1Token}`)
      .send({ estado: "RESUELTA" })
      .expect(200);

    const sent = await api().get("/operations/alerts/sent").set("Authorization", `Bearer ${pilotToken}`).expect(200);
    expect(sent.body[0].estadoAlerta).toBe("RESUELTA");
    expect(await historyCount()).toBe(2);
  });

  it("S10: each role is limited to its own endpoints (403)", async () => {
    await api().get("/operations/alerts/my-station").set("Authorization", `Bearer ${pilotToken}`).expect(403);
    await api()
      .patch(`/operations/alerts/${alertId}/status`)
      .set("Authorization", `Bearer ${pilotToken}`)
      .send({ estado: "RESUELTA" })
      .expect(403);
    await api()
      .post("/operations/alerts")
      .set("Authorization", `Bearer ${op1Token}`)
      .send({ tipoAlerta: "ACCIDENTE", idEstacionDestino: station1 })
      .expect(403);
    await api().get("/operations/alerts/my-unit/destinations").set("Authorization", `Bearer ${op1Token}`).expect(403);
    expect(await alertCount()).toBe(1);
  });

  // Central view. The shared test DB may hold other alerts, so assertions
  // target this run's line group only.
  const ourLine = (body: { lineas: { idLinea: string | null }[] }) =>
    body.lineas.find((l) => l.idLinea === ids.linea) as {
      numeroLinea: string;
      nombreLinea: string;
      estaciones: { idEstacion: string; unidades: { idUnidad: string; alerts: { idAlerta: string }[] }[] }[];
    };

  it("S12: the central operator and the admin see every station's alerts grouped line -> station -> unit", async () => {
    const created = await api()
      .post("/operations/alerts")
      .set("Authorization", `Bearer ${pilotToken}`)
      .send({ tipoAlerta: "RETRASO", idEstacionDestino: station3 })
      .expect(201);
    centralAlertId = created.body.idAlerta;

    for (const token of [centralToken, adminToken]) {
      const res = await api().get("/operations/alerts/central").set("Authorization", `Bearer ${token}`).expect(200);
      const line = ourLine(res.body);
      expect(line.numeroLinea).toBe(runTag.slice(-12));
      expect(line.nombreLinea).toBe(`${runTag} Línea`);
      expect(
        line.estaciones.map((e) => ({
          idEstacion: e.idEstacion,
          unidades: e.unidades.map((u) => ({ idUnidad: u.idUnidad, alerts: u.alerts.map((a) => a.idAlerta) })),
        })),
      ).toEqual([
        { idEstacion: station1, unidades: [{ idUnidad: ids.unidad, alerts: [alertId] }] },
        { idEstacion: station3, unidades: [{ idUnidad: ids.unidad, alerts: [centralAlertId] }] },
      ]);
    }
  });

  it("S13: the central operator advances another station's alert and one history row is written", async () => {
    const res = await api()
      .patch(`/operations/alerts/central/${centralAlertId}/status`)
      .set("Authorization", `Bearer ${centralToken}`)
      .send({ estado: "EN_ATENCION", observacion: "Central atiende" })
      .expect(200);
    expect(res.body.estadoAlerta).toBe("EN_ATENCION");

    const history = await rows<Record<string, string>>(
      `SELECT estado_anterior, estado_nuevo, observacion, id_empleado::text AS id_empleado
         FROM tbl_historial_estado WHERE id_alerta = $1`,
      [centralAlertId],
    );
    expect(history).toEqual([
      { estado_anterior: "PENDIENTE", estado_nuevo: "EN_ATENCION", observacion: "Central atiende", id_empleado: centralId },
    ]);

    const inbox = await api().get("/operations/alerts/my-station").set("Authorization", `Bearer ${op2Token}`).expect(200);
    expect(inbox.body.alerts.map((a: { idAlerta: string; estadoAlerta: string }) => [a.idAlerta, a.estadoAlerta])).toEqual([
      [centralAlertId, "EN_ATENCION"],
    ]);
  });

  it("S13: central non-forward transitions are 409 and unknown alerts 404, changing nothing", async () => {
    const conflict = await api()
      .patch(`/operations/alerts/central/${centralAlertId}/status`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ estado: "RECIBIDA" })
      .expect(409);
    expect(conflict.body.error).toBe("InvalidAlertTransition");

    await api()
      .patch("/operations/alerts/central/999999999999/status")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ estado: "RESUELTA" })
      .expect(404);

    const stored = await one<{ estado: string }>(
      `SELECT estado_alerta AS "estado" FROM tbl_alerta WHERE id_alerta = $1`,
      [centralAlertId],
    );
    expect(stored.estado).toBe("EN_ATENCION");
    const n = await one<{ n: string }>(`SELECT COUNT(*) AS "n" FROM tbl_historial_estado WHERE id_alerta = $1`, [
      centralAlertId,
    ]);
    expect(Number(n.n)).toBe(1);
  });

  it("S14: pilots and station operators cannot use the central endpoints (403)", async () => {
    for (const token of [pilotToken, op1Token]) {
      await api().get("/operations/alerts/central").set("Authorization", `Bearer ${token}`).expect(403);
      await api()
        .patch(`/operations/alerts/central/${centralAlertId}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estado: "RESUELTA" })
        .expect(403);
    }
    const stored = await one<{ estado: string }>(
      `SELECT estado_alerta AS "estado" FROM tbl_alerta WHERE id_alerta = $1`,
      [centralAlertId],
    );
    expect(stored.estado).toBe("EN_ATENCION");
  });
});
