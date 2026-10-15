// ============================================================================
// E2E for odd/tasks/ridership-capacity.md, against real Postgres.
//
//   - S4/S5: a turnstile pass stores one event; ENTRADA charges the fare from
//     the stored balance; every rejection leaves balance, events and alerts
//     unchanged.
//   - S6: the turnstile needs the simulator flag and the X-Turnstile-Key.
//   - S1/S7/S10: at 150% of the station capacity one system alert (no author)
//     is created, not repeated while it is not RESUELTA.
//   - S2/S8: bus arrival boards the waiting passengers and applies the 25%
//     rule; departure counts exits and boards the newly waiting.
//   - S9: readings and permissions.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Requires
// apps/api/.env exported and database/init.sql applied. Everything created
// here is removed in afterAll.
// ============================================================================

process.env.ADMIN_WEB_ORIGINS ??= "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID ??= "test-client-id";
process.env.TURNSTILE_SIMULATOR_ENABLED = "true";
process.env.TURNSTILE_API_KEY = "e2e-turnstile-key";

import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";
const KEY = "e2e-turnstile-key";

describe("Ridership (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const runTag = `E2E-RID-${Date.now()}`;
  const ids = {
    employees: [] as string[],
    paradas: [] as string[],
    estaciones: [] as string[],
    unidades: [] as string[],
    tarjetas: [] as string[],
  };
  let adminToken = "";
  let pilotToken = "";
  // A: capacity 4 (alert at 6). B, C: capacity 100.
  let stationA = "";
  let stationB = "";
  let stationC = "";
  let unit1 = "";
  let unit2 = "";
  let unitSmall = "";

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await dataSource.query(sql, params)) as T[];
  }

  async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
    const [row] = await rows<T>(sql, params);
    if (!row) throw new Error(`No row for: ${sql}`);
    return row;
  }

  async function createEmployee(roleCode: string, suffix: string): Promise<string> {
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
    return jwt.sign(
      { employeeId: id, email, roles: [roleCode], permissions, scope: { role: roleCode, modules: [] } },
      JWT_SECRET,
      { expiresIn: "12h" },
    );
  }

  async function createStation(name: string, capacidad: number): Promise<string> {
    const parada = await one<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA') RETURNING id_parada AS "id"`,
      [`${runTag} ${name}`],
    );
    ids.paradas.push(String(parada.id));
    const estacion = await one<{ id: string }>(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada, capacidad_pasajeros)
       VALUES ($1, 14.6, -90.5, 'ACTIVA', $2, $3) RETURNING id_estacion AS "id"`,
      [`${runTag} Estación ${name}`, parada.id, capacidad],
    );
    ids.estaciones.push(String(estacion.id));
    return String(estacion.id);
  }

  async function createUnit(suffix: string, capacidad: number): Promise<string> {
    const unidad = await one<{ id: string }>(
      `INSERT INTO tbl_unidad (numero_placa, marca, modelo, anio, capacidad_pasajeros, estado_unidad)
       VALUES ($1, 'Marca', 'Modelo', 2024, $2, 'EN_SERVICIO') RETURNING id_unidad AS "id"`,
      [`${runTag.slice(-10)}${suffix}`, capacidad],
    );
    ids.unidades.push(String(unidad.id));
    return String(unidad.id);
  }

  async function createCard(suffix: string, saldo: string, estado = "ACTIVA"): Promise<string> {
    const numero = `${runTag}-${suffix}`;
    const card = await one<{ id: string }>(
      `INSERT INTO tbl_tarjeta_ciudadana (numero_tarjeta, saldo, estado_tarjeta)
       VALUES ($1, $2, $3) RETURNING id_tarjeta_ciudadana AS "id"`,
      [numero, saldo, estado],
    );
    ids.tarjetas.push(String(card.id));
    return numero;
  }

  const api = () => request(app.getHttpServer());

  const pass = (numeroTarjeta: string, idEstacion: string, tipo: string, key: string | null = KEY) => {
    const req = api().post("/operations/ridership/turnstile");
    if (key !== null) req.set("X-Turnstile-Key", key);
    return req.send({ numeroTarjeta, idEstacion: Number(idEstacion), tipo });
  };

  const saldoOf = async (numero: string) =>
    (await one<{ saldo: string }>(`SELECT saldo FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1`, [numero])).saldo;

  const eventCount = async () =>
    Number(
      (
        await one<{ n: string }>(
          `SELECT COUNT(*) AS "n" FROM tbl_evento_talanquera WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`,
          [ids.tarjetas],
        )
      ).n,
    );

  const capacityAlerts = async (idEstacion: string) =>
    rows<{ idAlerta: string; estado: string; idEmpleado: string | null; tipoOrigen: string; tipoDestino: string; idUnidad: string | null }>(
      `SELECT id_alerta AS "idAlerta", estado_alerta AS "estado", id_empleado AS "idEmpleado",
              tipo_origen AS "tipoOrigen", tipo_destino AS "tipoDestino", id_unidad AS "idUnidad"
         FROM tbl_alerta WHERE tipo_alerta = 'CAPACIDAD_ESTACION' AND id_estacion_origen = $1
        ORDER BY id_alerta`,
      [idEstacion],
    );

  // Each ENTRADA needs a card with balance; one card can enter many times.
  let walletCard = "";
  const enter = async (idEstacion: string, times: number) => {
    let last: request.Response | undefined;
    for (let i = 0; i < times; i++) {
      last = await pass(walletCard, idEstacion, "ENTRADA");
      expect(last.status).toBe(201);
    }
    return last!;
  };
  const exit = async (idEstacion: string, times: number) => {
    for (let i = 0; i < times; i++) {
      expect((await pass(walletCard, idEstacion, "SALIDA")).status).toBe(201);
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    adminToken = await createEmployee("ADMINISTRADOR_SISTEMA", "admin");
    pilotToken = await createEmployee("PILOTO", "pilot");
    stationA = await createStation("A", 4);
    stationB = await createStation("B", 100);
    stationC = await createStation("C", 100);
    unit1 = await createUnit("U1", 40);
    unit2 = await createUnit("U2", 40);
    unitSmall = await createUnit("U3", 2);
    walletCard = await createCard("wallet", "500.00");
  });

  afterAll(async () => {
    if (dataSource) {
      const q = (sql: string, params: unknown[]) => dataSource.query(sql, params);
      if (ids.estaciones.length) {
        await q(
          `DELETE FROM tbl_historial_estado WHERE id_alerta IN (SELECT id_alerta FROM tbl_alerta WHERE id_estacion_origen = ANY($1::bigint[]))`,
          [ids.estaciones],
        );
        await q(`DELETE FROM tbl_alerta WHERE id_estacion_origen = ANY($1::bigint[])`, [ids.estaciones]);
        await q(`DELETE FROM tbl_evento_talanquera WHERE id_estacion = ANY($1::bigint[])`, [ids.estaciones]);
        await q(`DELETE FROM tbl_parada_unidad WHERE id_estacion = ANY($1::bigint[])`, [ids.estaciones]);
      }
      if (ids.unidades.length) await q(`DELETE FROM tbl_unidad WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
      if (ids.tarjetas.length) {
        await q(`DELETE FROM tbl_tarjeta_ciudadana WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`, [ids.tarjetas]);
      }
      if (ids.estaciones.length) await q(`DELETE FROM tbl_estacion WHERE id_estacion = ANY($1::bigint[])`, [ids.estaciones]);
      if (ids.paradas.length) await q(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [ids.paradas]);
      if (ids.employees.length) {
        await q(`DELETE FROM tbl_bitacora WHERE id_empleado = ANY($1::bigint[])`, [ids.employees]);
        await q(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [ids.employees]);
      }
    }
    if (app) await app.close();
  });

  describe("turnstile access (S6)", () => {
    it("rejects a pass without key or with a wrong key with 401 and stores nothing", async () => {
      const card = await createCard("nokey", "10.00");
      const before = await eventCount();

      expect((await pass(card, stationB, "ENTRADA", null)).status).toBe(401);
      expect((await pass(card, stationB, "ENTRADA", "wrong")).status).toBe(401);

      expect(await eventCount()).toBe(before);
      expect(await saldoOf(card)).toBe("10.00");
    });

    it("answers 404 and stores nothing while the simulator is disabled", async () => {
      const card = await createCard("disabled", "10.00");
      const before = await eventCount();
      process.env.TURNSTILE_SIMULATOR_ENABLED = "false";
      try {
        expect((await pass(card, stationB, "ENTRADA")).status).toBe(404);
      } finally {
        process.env.TURNSTILE_SIMULATOR_ENABLED = "true";
      }
      expect(await eventCount()).toBe(before);
      expect(await saldoOf(card)).toBe("10.00");
    });
  });

  describe("fare and events (S4, S5)", () => {
    it("ENTRADA charges Q1.00 from the stored balance and stores one event", async () => {
      const card = await createCard("entry", "10.00");
      const before = await eventCount();

      const res = await pass(card, stationC, "ENTRADA");

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        tipo: "ENTRADA",
        numeroTarjeta: card,
        montoCobrado: 1,
        saldo: 9,
        alertaGenerada: false,
        idAlerta: null,
      });
      expect(res.body.estacion).toMatchObject({ idEstacion: stationC, capacidadPasajeros: 100, personasEnEstacion: 1 });
      expect(await saldoOf(card)).toBe("9.00");
      expect(await eventCount()).toBe(before + 1);
      const event = await one<{ tipo: string; monto: string }>(
        `SELECT tipo_evento AS "tipo", monto_cobrado AS "monto" FROM tbl_evento_talanquera WHERE id_evento_talanquera = $1`,
        [res.body.idEvento],
      );
      expect(event).toEqual({ tipo: "ENTRADA", monto: "1.00" });
    });

    it("SALIDA charges nothing, ignores the card state and does not change the waiting count", async () => {
      const card = await createCard("exit-blocked", "3.00", "BLOQUEADA");
      const waiting = (await api().get(`/operations/ridership/stations/${stationC}`).set("Authorization", `Bearer ${adminToken}`)).body
        .personasEnEstacion;

      const res = await pass(card, stationC, "SALIDA");

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ tipo: "SALIDA", montoCobrado: 0, saldo: 3, alertaGenerada: false });
      expect(res.body.estacion.personasEnEstacion).toBe(waiting);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it.each([
      ["a blocked card", "BLOQUEADA", "10.00", 409],
      ["insufficient balance", "ACTIVA", "0.50", 409],
    ])("rejects ENTRADA with %s and changes nothing", async (_label, estado, saldo, status) => {
      const card = await createCard(`rej-${estado}-${saldo}`, saldo, estado);
      const before = await eventCount();

      const res = await pass(card, stationC, "ENTRADA");

      expect(res.status).toBe(status);
      expect(await saldoOf(card)).toBe(saldo);
      expect(await eventCount()).toBe(before);
    });

    it("rejects an unknown card and an unknown station with 404, and a bad body with 400, storing nothing", async () => {
      const card = await createCard("valid", "10.00");
      const before = await eventCount();

      expect((await pass(`${runTag}-missing`, stationC, "ENTRADA")).status).toBe(404);
      expect((await pass(card, "999999999", "ENTRADA")).status).toBe(404);
      expect((await pass(card, stationC, "ADENTRO")).status).toBe(400);
      expect(
        (await api().post("/operations/ridership/turnstile").set("X-Turnstile-Key", KEY).send({ idEstacion: Number(stationC), tipo: "ENTRADA" }))
          .status,
      ).toBe(400);

      expect(await eventCount()).toBe(before);
      expect(await saldoOf(card)).toBe("10.00");
    });
  });

  // odd/tasks/user-web.md S7: a retried pass with the same idempotencyKey is
  // stored and charged once.
  describe("turnstile idempotency (user-web S7)", () => {
    const passWithKey = (numeroTarjeta: string, idEstacion: string, tipo: string, idempotencyKey: unknown) =>
      api()
        .post("/operations/ridership/turnstile")
        .set("X-Turnstile-Key", KEY)
        .send({ numeroTarjeta, idEstacion: Number(idEstacion), tipo, idempotencyKey });

    it("returns the original pass for a retried key without a new event or charge", async () => {
      const card = await createCard("idem", "10.00");
      const key = `${runTag}-idem-1`;
      const before = await eventCount();

      const first = await passWithKey(card, stationC, "ENTRADA", key);
      const retry = await passWithKey(card, stationC, "ENTRADA", key);

      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ repetido: false, montoCobrado: 1, saldo: 9 });
      expect(retry.status).toBe(201);
      expect(retry.body).toMatchObject({
        idEvento: first.body.idEvento,
        repetido: true,
        montoCobrado: 1,
        saldo: 9,
        alertaGenerada: false,
        idAlerta: null,
      });
      expect(retry.body.estacion.personasEnEstacion).toBe(first.body.estacion.personasEnEstacion);
      expect(await eventCount()).toBe(before + 1);
      expect(await saldoOf(card)).toBe("9.00");
    });

    it("rejects a key reused with another type, station or card with 409 and changes nothing", async () => {
      const card = await createCard("idem-other", "10.00");
      const otherCard = await createCard("idem-other-2", "10.00");
      const key = `${runTag}-idem-2`;
      expect((await passWithKey(card, stationC, "ENTRADA", key)).status).toBe(201);
      const before = await eventCount();

      expect((await passWithKey(card, stationC, "SALIDA", key)).status).toBe(409);
      expect((await passWithKey(card, stationB, "ENTRADA", key)).status).toBe(409);
      expect((await passWithKey(otherCard, stationC, "ENTRADA", key)).status).toBe(409);

      expect(await eventCount()).toBe(before);
      expect(await saldoOf(card)).toBe("9.00");
      expect(await saldoOf(otherCard)).toBe("10.00");
    });

    it.each(["short", "has spaces in it", "x".repeat(65), 12345678])(
      "rejects idempotencyKey %p with 400 and stores nothing",
      async (key) => {
        const card = await createCard(`idem-bad-${String(key).length}-${typeof key}`, "10.00");
        const before = await eventCount();

        expect((await passWithKey(card, stationC, "ENTRADA", key)).status).toBe(400);

        expect(await eventCount()).toBe(before);
        expect(await saldoOf(card)).toBe("10.00");
      },
    );

    it("keeps passes without a key independent (repetido false each time)", async () => {
      const card = await createCard("idem-none", "10.00");

      const a = await pass(card, stationC, "ENTRADA");
      const b = await pass(card, stationC, "ENTRADA");

      expect(a.body.repetido).toBe(false);
      expect(b.body.repetido).toBe(false);
      expect(b.body.idEvento).not.toBe(a.body.idEvento);
      expect(await saldoOf(card)).toBe("8.00");
    });
  });

  describe("station capacity alert (S1, S7, S10)", () => {
    it("creates one system alert at 150% of the capacity and not again while it is open", async () => {
      // Capacity 4 -> 5 people is 125%, 6 people is 150%.
      const fifth = await enter(stationA, 5);
      expect(fifth.body).toMatchObject({ alertaGenerada: false });
      expect(fifth.body.estacion).toMatchObject({ personasEnEstacion: 5, porcentaje: 125, alertaActiva: false });
      expect(await capacityAlerts(stationA)).toHaveLength(0);

      const sixth = await enter(stationA, 1);
      expect(sixth.body.alertaGenerada).toBe(true);
      expect(sixth.body.estacion).toMatchObject({ personasEnEstacion: 6, porcentaje: 150, alertaActiva: true });
      const alerts = await capacityAlerts(stationA);
      expect(alerts).toEqual([
        {
          idAlerta: String(sixth.body.idAlerta),
          estado: "PENDIENTE",
          idEmpleado: null,
          tipoOrigen: "ESTACION",
          tipoDestino: "CENTRAL",
          idUnidad: null,
        },
      ]);

      const seventh = await enter(stationA, 1);
      expect(seventh.body).toMatchObject({ alertaGenerada: false, idAlerta: null });
      expect(await capacityAlerts(stationA)).toHaveLength(1);
    });

    it("lists the alert, resolves it with the central endpoint (autor null) and alerts again afterwards", async () => {
      const list = await api().get("/operations/ridership/alerts").set("Authorization", `Bearer ${adminToken}`);
      expect(list.status).toBe(200);
      const mine = list.body.filter((a: { estacion: { idEstacion: string } }) => a.estacion.idEstacion === stationA);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ estadoAlerta: "PENDIENTE", estacion: { idEstacion: stationA } });

      const resolved = await api()
        .patch(`/operations/alerts/central/${mine[0].idAlerta}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ estado: "RESUELTA" });
      expect(resolved.status).toBe(200);
      expect(resolved.body).toMatchObject({ estadoAlerta: "RESUELTA", autor: null, tipoAlerta: "CAPACIDAD_ESTACION" });

      const again = await enter(stationA, 1);
      expect(again.body.alertaGenerada).toBe(true);
      expect(await capacityAlerts(stationA)).toHaveLength(2);
    });

    it("keeps capacity alerts out of the unit -> station central view", async () => {
      const central = await api().get("/operations/alerts/central").set("Authorization", `Bearer ${adminToken}`);
      expect(central.status).toBe(200);
      expect(JSON.stringify(central.body)).not.toContain("CAPACIDAD_ESTACION");
    });
  });

  describe("bus stops (S2, S8)", () => {
    it("boards the waiting on arrival and adds 5 minutes below 25% (9 of 40)", async () => {
      await enter(stationB, 9);

      const res = await api()
        .post(`/operations/ridership/units/${unit1}/arrival`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ idEstacion: Number(stationB) });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        idUnidad: unit1,
        idEstacion: stationB,
        capacidadPasajeros: 40,
        ocupacionLlegada: 0,
        subieron: 9,
        bajaron: 0,
        ocupacionEstimada: 9,
        minutosEsperaExtra: 5,
        fechaSalida: null,
      });
      const station = await api().get(`/operations/ridership/stations/${stationB}`).set("Authorization", `Bearer ${adminToken}`);
      expect(station.body.personasEnEstacion).toBe(0);
    });

    it("rejects a second arrival while the stop is open with 409", async () => {
      const res = await api()
        .post(`/operations/ridership/units/${unit1}/arrival`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ idEstacion: Number(stationC) });
      expect(res.status).toBe(409);
    });

    it("adds no minutes at exactly 25% (10 of 40)", async () => {
      const waiting = (await api().get(`/operations/ridership/stations/${stationC}`).set("Authorization", `Bearer ${adminToken}`)).body
        .personasEnEstacion as number;
      await enter(stationC, 10 - waiting);

      const res = await api()
        .post(`/operations/ridership/units/${unit2}/arrival`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ idEstacion: Number(stationC) });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ subieron: 10, ocupacionEstimada: 10, minutosEsperaExtra: 0 });
    });

    it("on departure boards the newly waiting and counts exits only up to the arrival occupancy", async () => {
      // unit1 arrived at B with 0 aboard: 2 exits cannot get anyone off.
      await exit(stationB, 2);
      await enter(stationB, 1);

      const res = await api()
        .post(`/operations/ridership/units/${unit1}/departure`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ocupacionLlegada: 0, bajaron: 0, subieron: 10, ocupacionEstimada: 10 });
      expect(res.body.fechaSalida).not.toBeNull();
    });

    it("subtracts exits from the occupancy the bus arrived with", async () => {
      await api().post(`/operations/ridership/units/${unit2}/departure`).set("Authorization", `Bearer ${adminToken}`).send();
      const arrival = await api()
        .post(`/operations/ridership/units/${unit1}/arrival`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ idEstacion: Number(stationC) });
      expect(arrival.body).toMatchObject({ ocupacionLlegada: 10, subieron: 0, ocupacionEstimada: 10 });
      await exit(stationC, 3);

      const res = await api().post(`/operations/ridership/units/${unit1}/departure`).set("Authorization", `Bearer ${adminToken}`).send();

      expect(res.body).toMatchObject({ ocupacionLlegada: 10, bajaron: 3, ocupacionEstimada: 7 });
      const unit = await api().get(`/operations/ridership/units/${unit1}`).set("Authorization", `Bearer ${adminToken}`);
      expect(unit.status).toBe(200);
      expect(unit.body).toMatchObject({ idUnidad: unit1, capacidadPasajeros: 40, ocupacionEstimada: 7, paradaAbierta: null });
    });

    it("never boards more than the free seats and leaves the rest waiting", async () => {
      const before = (await api().get(`/operations/ridership/stations/${stationA}`).set("Authorization", `Bearer ${adminToken}`)).body
        .personasEnEstacion as number;

      const res = await api()
        .post(`/operations/ridership/units/${unitSmall}/arrival`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ idEstacion: Number(stationA) });

      expect(res.body).toMatchObject({ capacidadPasajeros: 2, subieron: 2, ocupacionEstimada: 2, minutosEsperaExtra: 0 });
      const after = await api().get(`/operations/ridership/stations/${stationA}`).set("Authorization", `Bearer ${adminToken}`);
      expect(after.body.personasEnEstacion).toBe(before - 2);
      const unit = await api().get(`/operations/ridership/units/${unitSmall}`).set("Authorization", `Bearer ${adminToken}`);
      expect(unit.body.paradaAbierta).toMatchObject({ idEstacion: stationA, minutosEsperaExtra: 0 });
    });

    it("rejects a departure without an open stop (409), unknown unit or station (404) and stores nothing", async () => {
      const stops = async () =>
        Number(
          (await one<{ n: string }>(`SELECT COUNT(*) AS "n" FROM tbl_parada_unidad WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades])).n,
        );
      const before = await stops();

      expect((await api().post(`/operations/ridership/units/${unit1}/departure`).set("Authorization", `Bearer ${adminToken}`).send()).status).toBe(409);
      expect(
        (await api().post(`/operations/ridership/units/999999999/arrival`).set("Authorization", `Bearer ${adminToken}`).send({ idEstacion: Number(stationB) }))
          .status,
      ).toBe(404);
      expect(
        (await api().post(`/operations/ridership/units/${unit1}/arrival`).set("Authorization", `Bearer ${adminToken}`).send({ idEstacion: 999999999 }))
          .status,
      ).toBe(404);
      expect((await api().get(`/operations/ridership/units/999999999`).set("Authorization", `Bearer ${adminToken}`)).status).toBe(404);
      expect((await api().get(`/operations/ridership/stations/999999999`).set("Authorization", `Bearer ${adminToken}`)).status).toBe(404);

      expect(await stops()).toBe(before);
    });
  });

  describe("permissions (S8, S9)", () => {
    it("requires a token and the right permission", async () => {
      expect((await api().get(`/operations/ridership/stations/${stationA}`)).status).toBe(401);
      expect((await api().get(`/operations/ridership/stations/${stationA}`).set("Authorization", `Bearer ${pilotToken}`)).status).toBe(403);
      expect((await api().get(`/operations/ridership/alerts`).set("Authorization", `Bearer ${pilotToken}`)).status).toBe(403);
      expect(
        (await api().post(`/operations/ridership/units/${unit2}/arrival`).set("Authorization", `Bearer ${pilotToken}`).send({ idEstacion: Number(stationB) }))
          .status,
      ).toBe(403);
    });
  });
});
