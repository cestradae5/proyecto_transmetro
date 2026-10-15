// ============================================================================
// E2E for odd/tasks/ridership-capacity.md, against real Postgres.
//
//   - S4/S5: a turnstile pass stores one event; ENTRADA charges the fare from
//     the stored balance; every rejection leaves balance, events and alerts
//     unchanged.
//   - S6: the turnstile needs the simulator flag and the X-Turnstile-Key.
//   - S1/S7/S10: at 150% of the station capacity one system alert (no author)
//     is created, not repeated while it is not RESUELTA.
//   - bus-passenger-report: the turnstile is the only in/out of a parada;
//     the pilot reports who got off and on at the unit's current stop, with
//     the 25% rule applied after the report.
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
    lineas: [] as string[],
  };
  let adminToken = "";
  let pilotToken = "";
  // A: plain parada, capacity 4 (alert at 6). B, C: paradas with a station,
  // capacity 100. D: parada with a station, capacity 2 (alert at 3).
  let stopA = "";
  let stopB = "";
  let stopC = "";
  let stopD = "";
  const estacionOf = new Map<string, string>();
  // Bus report (bus-passenger-report.md): line L runs E (plain parada) -> F
  // (parada with a station). pilot1 drives unit1 (capacity 40); pilot2 drives
  // unitSmall (capacity 2); pilot3 has no unit.
  let stopE = "";
  let stopF = "";
  const linePositions = new Map<string, string>();
  let unit1 = "";
  let unitSmall = "";
  let pilot1 = { id: "", token: "" };
  let pilot2 = { id: "", token: "" };
  let pilot3Token = "";
  let stationOperatorToken = "";

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await dataSource.query(sql, params)) as T[];
  }

  async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
    const [row] = await rows<T>(sql, params);
    if (!row) throw new Error(`No row for: ${sql}`);
    return row;
  }

  async function createEmployee(roleCode: string, suffix: string): Promise<string> {
    return (await createEmployeeWithId(roleCode, suffix)).token;
  }

  async function createEmployeeWithId(roleCode: string, suffix: string): Promise<{ id: string; token: string }> {
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

  // A line whose route is the given paradas, in order; remembers each
  // parada's tbl_linea_parada id so the pilot can report it as the stop.
  async function createLine(route: string[]): Promise<string> {
    const linea = await one<{ id: string }>(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido)
       VALUES ($1, $2, '#FF6600', 'ACTIVA', 'LINEAL') RETURNING id_linea AS "id"`,
      [runTag.slice(-12), `${runTag} Línea`],
    );
    ids.lineas.push(String(linea.id));
    for (const [index, idParada] of route.entries()) {
      const lp = await one<{ id: string }>(
        `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea)
         VALUES ($1, 3, $2, $3) RETURNING id_linea_parada AS "id"`,
        [index + 1, idParada, linea.id],
      );
      linePositions.set(idParada, String(lp.id));
    }
    return String(linea.id);
  }

  async function assignPilot(pilotId: string, idUnidad: string, idLinea: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO tbl_asignacion_piloto (fecha_asignacion, id_empleado, id_unidad) VALUES (CURRENT_TIMESTAMP, $1, $2)`,
      [pilotId, idUnidad],
    );
    await dataSource.query(
      `INSERT INTO tbl_asignacion_unidad (fecha_asignacion, id_unidad, id_linea) VALUES (CURRENT_TIMESTAMP, $1, $2)`,
      [idUnidad, idLinea],
    );
  }

  // A parada with its capacity; withStation also gives it a tbl_estacion row.
  // Returns the parada id: passengers are counted per parada.
  async function createStop(name: string, capacidad: number, withStation: boolean): Promise<string> {
    const parada = await one<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada, capacidad_pasajeros)
       VALUES ($1, 14.6, -90.5, 'ACTIVA', $2) RETURNING id_parada AS "id"`,
      [`${runTag} ${name}`, capacidad],
    );
    ids.paradas.push(String(parada.id));
    if (withStation) {
      const estacion = await one<{ id: string }>(
        `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
         VALUES ($1, 14.6, -90.5, 'ACTIVA', $2) RETURNING id_estacion AS "id"`,
        [`${runTag} Estación ${name}`, parada.id],
      );
      ids.estaciones.push(String(estacion.id));
      estacionOf.set(String(parada.id), String(estacion.id));
    }
    return String(parada.id);
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

  const pass = (numeroTarjeta: string, idParada: string, tipo: string, key: string | null = KEY) => {
    const req = api().post("/operations/ridership/turnstile");
    if (key !== null) req.set("X-Turnstile-Key", key);
    return req.send({ numeroTarjeta, idParada: Number(idParada), tipo });
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

  const capacityAlerts = async (idParada: string) =>
    rows<{
      idAlerta: string;
      estado: string;
      idEmpleado: string | null;
      tipoOrigen: string;
      tipoDestino: string;
      idUnidad: string | null;
      idEstacionOrigen: string | null;
    }>(
      `SELECT id_alerta AS "idAlerta", estado_alerta AS "estado", id_empleado AS "idEmpleado",
              tipo_origen AS "tipoOrigen", tipo_destino AS "tipoDestino", id_unidad AS "idUnidad",
              id_estacion_origen AS "idEstacionOrigen"
         FROM tbl_alerta WHERE tipo_alerta = 'CAPACIDAD_ESTACION' AND id_parada_origen = $1
        ORDER BY id_alerta`,
      [idParada],
    );

  // Each ENTRADA needs a card with balance; one card can enter many times.
  let walletCard = "";
  const enter = async (idParada: string, times: number) => {
    let last: request.Response | undefined;
    for (let i = 0; i < times; i++) {
      last = await pass(walletCard, idParada, "ENTRADA");
      expect(last.status).toBe(201);
    }
    return last!;
  };
  const exit = async (idParada: string, times: number) => {
    for (let i = 0; i < times; i++) {
      expect((await pass(walletCard, idParada, "SALIDA")).status).toBe(201);
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
    stopA = await createStop("A", 4, false);
    stopB = await createStop("B", 100, true);
    stopC = await createStop("C", 100, true);
    stopD = await createStop("D", 2, true);
    stopE = await createStop("E", 100, false);
    stopF = await createStop("F", 100, true);
    const linea = await createLine([stopE, stopF]);
    unit1 = await createUnit("U1", 40);
    unitSmall = await createUnit("U3", 2);
    pilot1 = await createEmployeeWithId("PILOTO", "pilot1");
    pilot2 = await createEmployeeWithId("PILOTO", "pilot2");
    pilot3Token = await createEmployee("PILOTO", "pilot3");
    stationOperatorToken = await createEmployee("OPERADOR_ESTACION", "operador");
    await assignPilot(pilot1.id, unit1, linea);
    await assignPilot(pilot2.id, unitSmall, linea);
    walletCard = await createCard("wallet", "500.00");
  });

  afterAll(async () => {
    if (dataSource) {
      const q = (sql: string, params: unknown[]) => dataSource.query(sql, params);
      if (ids.paradas.length) {
        await q(
          `DELETE FROM tbl_historial_estado WHERE id_alerta IN (SELECT id_alerta FROM tbl_alerta WHERE id_parada_origen = ANY($1::bigint[]))`,
          [ids.paradas],
        );
        await q(`DELETE FROM tbl_alerta WHERE id_parada_origen = ANY($1::bigint[])`, [ids.paradas]);
        await q(`DELETE FROM tbl_evento_talanquera WHERE id_parada = ANY($1::bigint[])`, [ids.paradas]);
        await q(`DELETE FROM tbl_parada_unidad WHERE id_parada = ANY($1::bigint[])`, [ids.paradas]);
      }
      if (ids.unidades.length) {
        await q(`DELETE FROM tbl_parada_unidad WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
        await q(`DELETE FROM tbl_asignacion_piloto WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
        await q(`DELETE FROM tbl_asignacion_unidad WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
        await q(`DELETE FROM tbl_unidad WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades]);
      }
      if (ids.lineas.length) {
        await q(`DELETE FROM tbl_linea_parada WHERE id_linea = ANY($1::bigint[])`, [ids.lineas]);
        await q(`DELETE FROM tbl_linea WHERE id_linea = ANY($1::bigint[])`, [ids.lineas]);
      }
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

      expect((await pass(card, stopB, "ENTRADA", null)).status).toBe(401);
      expect((await pass(card, stopB, "ENTRADA", "wrong")).status).toBe(401);

      expect(await eventCount()).toBe(before);
      expect(await saldoOf(card)).toBe("10.00");
    });

    it("answers 404 and stores nothing while the simulator is disabled", async () => {
      const card = await createCard("disabled", "10.00");
      const before = await eventCount();
      process.env.TURNSTILE_SIMULATOR_ENABLED = "false";
      try {
        expect((await pass(card, stopB, "ENTRADA")).status).toBe(404);
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

      const res = await pass(card, stopC, "ENTRADA");

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        tipo: "ENTRADA",
        numeroTarjeta: card,
        montoCobrado: 1,
        saldo: 9,
        alertaGenerada: false,
        idAlerta: null,
      });
      expect(res.body.parada).toMatchObject({
        idParada: stopC,
        idEstacion: estacionOf.get(stopC),
        capacidadPasajeros: 100,
        personasEnParada: 1,
      });
      expect(await saldoOf(card)).toBe("9.00");
      expect(await eventCount()).toBe(before + 1);
      const event = await one<{ tipo: string; monto: string }>(
        `SELECT tipo_evento AS "tipo", monto_cobrado AS "monto" FROM tbl_evento_talanquera WHERE id_evento_talanquera = $1`,
        [res.body.idEvento],
      );
      expect(event).toEqual({ tipo: "ENTRADA", monto: "1.00" });
    });

    // bus-passenger-report S2: the turnstile is the only in/out of a parada.
    it("SALIDA charges nothing, ignores the card state and removes one person from the parada", async () => {
      const card = await createCard("exit-blocked", "3.00", "BLOQUEADA");
      const waiting = (await api().get(`/operations/ridership/stops/${stopC}`).set("Authorization", `Bearer ${adminToken}`)).body
        .personasEnParada as number;
      expect(waiting).toBeGreaterThan(0);

      const res = await pass(card, stopC, "SALIDA");

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ tipo: "SALIDA", montoCobrado: 0, saldo: 3, alertaGenerada: false });
      expect(res.body.parada.personasEnParada).toBe(waiting - 1);
      expect(await saldoOf(card)).toBe("3.00");
    });

    it("a SALIDA at an empty parada is accepted and the count stays at 0", async () => {
      const empty = await createStop("Vacia", 10, false);

      const res = await pass(walletCard, empty, "SALIDA");

      expect(res.status).toBe(201);
      expect(res.body.parada.personasEnParada).toBe(0);
      expect((await enter(empty, 1)).body.parada.personasEnParada).toBe(1);
    });

    it.each([
      ["a blocked card", "BLOQUEADA", "10.00", 409],
      ["insufficient balance", "ACTIVA", "0.50", 409],
    ])("rejects ENTRADA with %s and changes nothing", async (_label, estado, saldo, status) => {
      const card = await createCard(`rej-${estado}-${saldo}`, saldo, estado);
      const before = await eventCount();

      const res = await pass(card, stopC, "ENTRADA");

      expect(res.status).toBe(status);
      expect(await saldoOf(card)).toBe(saldo);
      expect(await eventCount()).toBe(before);
    });

    it("rejects an unknown card and an unknown station with 404, and a bad body with 400, storing nothing", async () => {
      const card = await createCard("valid", "10.00");
      const before = await eventCount();

      expect((await pass(`${runTag}-missing`, stopC, "ENTRADA")).status).toBe(404);
      expect((await pass(card, "999999999", "ENTRADA")).status).toBe(404);
      expect((await pass(card, stopC, "ADENTRO")).status).toBe(400);
      expect(
        (await api().post("/operations/ridership/turnstile").set("X-Turnstile-Key", KEY).send({ idParada: Number(stopC), tipo: "ENTRADA" }))
          .status,
      ).toBe(400);

      expect(await eventCount()).toBe(before);
      expect(await saldoOf(card)).toBe("10.00");
    });
  });

  // odd/tasks/user-web.md S7: a retried pass with the same idempotencyKey is
  // stored and charged once.
  describe("turnstile idempotency (user-web S7)", () => {
    const passWithKey = (numeroTarjeta: string, idParada: string, tipo: string, idempotencyKey: unknown) =>
      api()
        .post("/operations/ridership/turnstile")
        .set("X-Turnstile-Key", KEY)
        .send({ numeroTarjeta, idParada: Number(idParada), tipo, idempotencyKey });

    it("returns the original pass for a retried key without a new event or charge", async () => {
      const card = await createCard("idem", "10.00");
      const key = `${runTag}-idem-1`;
      const before = await eventCount();

      const first = await passWithKey(card, stopC, "ENTRADA", key);
      const retry = await passWithKey(card, stopC, "ENTRADA", key);

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
      expect(retry.body.parada.personasEnParada).toBe(first.body.parada.personasEnParada);
      expect(await eventCount()).toBe(before + 1);
      expect(await saldoOf(card)).toBe("9.00");
    });

    it("rejects a key reused with another type, station or card with 409 and changes nothing", async () => {
      const card = await createCard("idem-other", "10.00");
      const otherCard = await createCard("idem-other-2", "10.00");
      const key = `${runTag}-idem-2`;
      expect((await passWithKey(card, stopC, "ENTRADA", key)).status).toBe(201);
      const before = await eventCount();

      expect((await passWithKey(card, stopC, "SALIDA", key)).status).toBe(409);
      expect((await passWithKey(card, stopB, "ENTRADA", key)).status).toBe(409);
      expect((await passWithKey(otherCard, stopC, "ENTRADA", key)).status).toBe(409);

      expect(await eventCount()).toBe(before);
      expect(await saldoOf(card)).toBe("9.00");
      expect(await saldoOf(otherCard)).toBe("10.00");
    });

    it.each(["short", "has spaces in it", "x".repeat(65), 12345678])(
      "rejects idempotencyKey %p with 400 and stores nothing",
      async (key) => {
        const card = await createCard(`idem-bad-${String(key).length}-${typeof key}`, "10.00");
        const before = await eventCount();

        expect((await passWithKey(card, stopC, "ENTRADA", key)).status).toBe(400);

        expect(await eventCount()).toBe(before);
        expect(await saldoOf(card)).toBe("10.00");
      },
    );

    it("keeps passes without a key independent (repetido false each time)", async () => {
      const card = await createCard("idem-none", "10.00");

      const a = await pass(card, stopC, "ENTRADA");
      const b = await pass(card, stopC, "ENTRADA");

      expect(a.body.repetido).toBe(false);
      expect(b.body.repetido).toBe(false);
      expect(b.body.idEvento).not.toBe(a.body.idEvento);
      expect(await saldoOf(card)).toBe("8.00");
    });
  });

  describe("capacity alert per parada (parada-ridership S2, S6)", () => {
    it("alerts a plain parada (no station) at 150% once, without station, and not again while it is open", async () => {
      // Parada A has no station. Capacity 4 -> 5 people is 125%, 6 is 150%.
      const fifth = await enter(stopA, 5);
      expect(fifth.body).toMatchObject({ alertaGenerada: false });
      expect(fifth.body.parada).toMatchObject({ personasEnParada: 5, porcentaje: 125, alertaActiva: false });
      expect(await capacityAlerts(stopA)).toHaveLength(0);

      const sixth = await enter(stopA, 1);
      expect(sixth.body.alertaGenerada).toBe(true);
      expect(sixth.body.parada).toMatchObject({ personasEnParada: 6, porcentaje: 150, alertaActiva: true });
      const alerts = await capacityAlerts(stopA);
      expect(alerts).toEqual([
        {
          idAlerta: String(sixth.body.idAlerta),
          estado: "PENDIENTE",
          idEmpleado: null,
          tipoOrigen: "ESTACION",
          tipoDestino: "CENTRAL",
          idUnidad: null,
          idEstacionOrigen: null,
        },
      ]);
      expect(sixth.body.parada).toMatchObject({ idParada: stopA, idEstacion: null, capacidadPasajeros: 4 });

      const seventh = await enter(stopA, 1);
      expect(seventh.body).toMatchObject({ alertaGenerada: false, idAlerta: null });
      expect(await capacityAlerts(stopA)).toHaveLength(1);
    });

    it("lists the alert, resolves it with the central endpoint (autor null) and alerts again afterwards", async () => {
      const list = await api().get("/operations/ridership/alerts").set("Authorization", `Bearer ${adminToken}`);
      expect(list.status).toBe(200);
      const mine = list.body.filter((a: { parada: { idParada: string } }) => a.parada.idParada === stopA);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ estadoAlerta: "PENDIENTE", parada: { idParada: stopA, idEstacion: null } });

      const resolved = await api()
        .patch(`/operations/alerts/central/${mine[0].idAlerta}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ estado: "RESUELTA" });
      expect(resolved.status).toBe(200);
      expect(resolved.body).toMatchObject({ estadoAlerta: "RESUELTA", autor: null, tipoAlerta: "CAPACIDAD_ESTACION" });

      const again = await enter(stopA, 1);
      expect(again.body.alertaGenerada).toBe(true);
      expect(await capacityAlerts(stopA)).toHaveLength(2);
    });

    it("alerts a parada that is a station using the parada's capacity and stores its station", async () => {
      // Parada D (with a station) has capacity 2 -> 3 people is 150%.
      expect((await enter(stopD, 2)).body.alertaGenerada).toBe(false);

      const third = await enter(stopD, 1);

      expect(third.body.alertaGenerada).toBe(true);
      expect(third.body.parada).toMatchObject({
        idParada: stopD,
        idEstacion: estacionOf.get(stopD),
        capacidadPasajeros: 2,
        personasEnParada: 3,
        porcentaje: 150,
      });
      const alerts = await capacityAlerts(stopD);
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.idEstacionOrigen).toBe(estacionOf.get(stopD));
      const list = await api().get("/operations/ridership/alerts").set("Authorization", `Bearer ${adminToken}`);
      expect(list.body.find((a: { idAlerta: string }) => a.idAlerta === alerts[0]!.idAlerta)).toMatchObject({
        parada: { idParada: stopD, idEstacion: estacionOf.get(stopD) },
      });
    });

    it("answers 404 with the parada message for an unknown parada", async () => {
      const res = await pass(walletCard, "999999999", "ENTRADA");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Parada con ID 999999999 no existe.");
    });

    it("keeps capacity alerts out of the unit -> station central view", async () => {
      const central = await api().get("/operations/alerts/central").set("Authorization", `Bearer ${adminToken}`);
      expect(central.status).toBe(200);
      expect(JSON.stringify(central.body)).not.toContain("CAPACIDAD_ESTACION");
    });
  });

  // odd/tasks/bus-passenger-report.md S3-S9: the pilot reports, at the unit's
  // current stop, how many got off and on; the bus only moves people.
  describe("pilot passenger report (bus-passenger-report S3-S9)", () => {
    const myUnit = (token: string) => api().get("/operations/ridership/my-unit").set("Authorization", `Bearer ${token}`);
    const report = (token: string, body: Record<string, unknown>) =>
      api().post("/operations/ridership/my-unit/stop-report").set("Authorization", `Bearer ${token}`).send(body);
    const atStop = async (token: string, idParada: string) => {
      const res = await api()
        .post("/fleet/units/my-unit/location")
        .set("Authorization", `Bearer ${token}`)
        .send({ idLineaParada: linePositions.get(idParada) });
      expect(res.status).toBe(200);
    };
    const people = async (idParada: string) =>
      (await api().get(`/operations/ridership/stops/${idParada}`).set("Authorization", `Bearer ${adminToken}`)).body
        .personasEnParada as number;
    const reportCount = async () =>
      Number(
        (await one<{ n: string }>(`SELECT COUNT(*) AS "n" FROM tbl_parada_unidad WHERE id_unidad = ANY($1::bigint[])`, [ids.unidades])).n,
      );

    it("starts with nobody on board and no report", async () => {
      const res = await myUnit(pilot1.token);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        idUnidad: unit1,
        numeroPlaca: `${runTag.slice(-10)}U1`,
        capacidadPasajeros: 40,
        aBordo: 0,
        porcentaje: 0,
        ultimoReporte: null,
      });
    });

    it("rejects a report before the unit has a current stop (409) and stores nothing", async () => {
      const before = await reportCount();

      const res = await report(pilot1.token, { bajaron: 0, subieron: 1 });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("Reporte primero la parada en la que se encuentra la unidad.");
      expect(await reportCount()).toBe(before);
    });

    it("accepts boarding more people than the parada counts and floors the parada at 0 (S4); 5 of 40 waits 5 minutes", async () => {
      await enter(stopE, 3);
      await atStop(pilot1.token, stopE);

      const res = await report(pilot1.token, { bajaron: 0, subieron: 5 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        idParada: stopE,
        nombreParada: `${runTag} E`,
        bajaron: 0,
        subieron: 5,
        aBordo: 5,
        porcentaje: 13,
        minutosEsperaExtra: 5,
      });
      expect(await people(stopE)).toBe(0);
      // The floor sticks: the extra 2 boarders never eat a later entry.
      expect((await enter(stopE, 1)).body.parada.personasEnParada).toBe(1);
      await exit(stopE, 1);
      expect(await people(stopE)).toBe(0);
      const stored = await one<{ idEmpleado: string; idParada: string }>(
        `SELECT id_empleado AS "idEmpleado", id_parada AS "idParada" FROM tbl_parada_unidad WHERE id_parada_unidad = $1`,
        [res.body.idParadaUnidad],
      );
      expect(stored).toEqual({ idEmpleado: pilot1.id, idParada: stopE });
    });

    it("drops passengers at the next parada before boarding (bus -> parada, parada -> bus)", async () => {
      await enter(stopF, 2);
      await atStop(pilot1.token, stopF);

      const res = await report(pilot1.token, { bajaron: 2, subieron: 1 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ idParada: stopF, bajaron: 2, subieron: 1, aBordo: 4, minutosEsperaExtra: 5 });
      // 2 entered + 2 got off the bus - 1 got on.
      expect(await people(stopF)).toBe(3);
    });

    it("adds no minutes at exactly 25% (10 of 40) and shows the last report", async () => {
      const res = await report(pilot1.token, { bajaron: 0, subieron: 6 });
      expect(res.body).toMatchObject({ aBordo: 10, porcentaje: 25, minutosEsperaExtra: 0 });

      const unit = await myUnit(pilot1.token);
      expect(unit.body).toMatchObject({ aBordo: 10, porcentaje: 25 });
      expect(unit.body.ultimoReporte).toMatchObject({
        idParadaUnidad: res.body.idParadaUnidad,
        idParada: stopF,
        bajaron: 0,
        subieron: 6,
        aBordo: 10,
        minutosEsperaExtra: 0,
      });
      expect(new Date(unit.body.ultimoReporte.fecha).toISOString()).toBe(unit.body.ultimoReporte.fecha);

      const central = await api().get(`/operations/ridership/units/${unit1}`).set("Authorization", `Bearer ${adminToken}`);
      expect(central.status).toBe(200);
      expect(central.body).toEqual(unit.body);
    });

    it("accepts a 0/0 report (the bus stopped and nobody moved)", async () => {
      const res = await report(pilot1.token, { bajaron: 0, subieron: 0 });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ bajaron: 0, subieron: 0, aBordo: 10 });
    });

    // Verifier probe (S5/S7): the last report is the last one inserted, even
    // when an earlier transaction stamped a later fecha_reporte.
    it("reads on-board from the newest report regardless of fecha_reporte skew", async () => {
      const first = await report(pilot1.token, { bajaron: 0, subieron: 0 });
      const second = await report(pilot1.token, { bajaron: 1, subieron: 1 });
      expect(second.status).toBe(201);
      await dataSource.query(
        `UPDATE tbl_parada_unidad
            SET fecha_reporte = (SELECT fecha_reporte FROM tbl_parada_unidad WHERE id_parada_unidad = $1) - interval '1 second'
          WHERE id_parada_unidad = $2`,
        [first.body.idParadaUnidad, second.body.idParadaUnidad],
      );

      const unit = await myUnit(pilot1.token);

      expect(unit.body.aBordo).toBe(second.body.aBordo);
      expect(unit.body.ultimoReporte.idParadaUnidad).toBe(second.body.idParadaUnidad);
    });

    // Verifier probe (S3): unit and parada never come from the body, and
    // concurrent reports of one unit stay consistent.
    it("ignores body ids and serializes concurrent reports", async () => {
      const before = (await myUnit(pilot1.token)).body.aBordo as number;

      const [a, b] = await Promise.all([
        report(pilot1.token, { bajaron: 0, subieron: 1, idUnidad: unitSmall, idParada: stopE }),
        report(pilot1.token, { bajaron: 0, subieron: 1 }),
      ]);

      expect([a.status, b.status]).toEqual([201, 201]);
      expect(new Set([a.body.aBordo, b.body.aBordo])).toEqual(new Set([before + 1, before + 2]));
      expect([a.body.idParada, b.body.idParada]).toEqual([stopF, stopF]);
      expect((await myUnit(pilot1.token)).body.aBordo).toBe(before + 2);
      // Back to 10 on board for the next tests.
      expect((await report(pilot1.token, { bajaron: 2, subieron: 0 })).body.aBordo).toBe(before);
    });

    it("rejects more people getting off than are on board (409), changing nothing", async () => {
      const before = await reportCount();
      const waiting = await people(stopF);

      const res = await report(pilot1.token, { bajaron: 11, subieron: 0 });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("No pueden bajar 11 pasajeros: la unidad lleva 10.");
      expect(await reportCount()).toBe(before);
      expect(await people(stopF)).toBe(waiting);
      expect((await myUnit(pilot1.token)).body.aBordo).toBe(10);
    });

    it("rejects going over the unit capacity (409), changing nothing", async () => {
      await atStop(pilot2.token, stopE);
      const before = await reportCount();

      const res = await report(pilot2.token, { bajaron: 0, subieron: 3 });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("La unidad quedaría con 3 pasajeros y su capacidad es 2.");
      expect(await reportCount()).toBe(before);
      expect((await report(pilot2.token, { bajaron: 0, subieron: 2 })).body).toMatchObject({ aBordo: 2, minutosEsperaExtra: 0 });
    });

    it.each([
      ["a negative number", { bajaron: -1, subieron: 0 }],
      ["a decimal", { bajaron: 0, subieron: 1.5 }],
      ["a string", { bajaron: "2", subieron: 0 }],
      ["a missing field", { subieron: 1 }],
    ])("rejects %s with 400 and stores nothing", async (_label, body) => {
      const before = await reportCount();

      expect((await report(pilot1.token, body)).status).toBe(400);
      expect(await reportCount()).toBe(before);
    });

    it("answers 404 to a pilot without a unit", async () => {
      expect((await myUnit(pilot3Token)).status).toBe(404);
      expect((await report(pilot3Token, { bajaron: 0, subieron: 0 })).status).toBe(404);
    });

    it("no longer serves arrival and departure", async () => {
      expect(
        (await api().post(`/operations/ridership/units/${unit1}/arrival`).set("Authorization", `Bearer ${adminToken}`).send({ idParada: Number(stopE) }))
          .status,
      ).toBe(404);
      expect((await api().post(`/operations/ridership/units/${unit1}/departure`).set("Authorization", `Bearer ${adminToken}`).send()).status).toBe(404);
    });
  });

  describe("permissions", () => {
    it("requires a token and the right permission", async () => {
      expect((await api().get(`/operations/ridership/stops/${stopA}`)).status).toBe(401);
      expect((await api().get(`/operations/ridership/stops/${stopA}`).set("Authorization", `Bearer ${pilotToken}`)).status).toBe(403);
      expect((await api().get(`/operations/ridership/alerts`).set("Authorization", `Bearer ${pilotToken}`)).status).toBe(403);
      expect((await api().get("/operations/ridership/my-unit")).status).toBe(401);
      expect(
        (await api().get("/operations/ridership/my-unit").set("Authorization", `Bearer ${stationOperatorToken}`)).status,
      ).toBe(403);
      expect(
        (
          await api()
            .post("/operations/ridership/my-unit/stop-report")
            .set("Authorization", `Bearer ${stationOperatorToken}`)
            .send({ bajaron: 0, subieron: 0 })
        ).status,
      ).toBe(403);
    });
  });
});
