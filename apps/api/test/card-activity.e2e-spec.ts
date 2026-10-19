// ============================================================================
// E2E for odd/tasks/card-activity.md (S2-S4), against real Postgres: the staff
// view of each card's turnstile passes and recharges.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Requires
// apps/api/.env exported and database/init.sql applied. Everything created
// here is removed in afterAll.
// ============================================================================

process.env.ADMIN_WEB_ORIGINS ??= "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID ??= "test-client-id";

import { randomUUID } from "node:crypto";

import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import jwt from "jsonwebtoken";
import request from "supertest";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";

describe("Card activity (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const runTag = `E2E-CARD-${Date.now()}`;
  const ids = { employees: [] as string[], paradas: [] as string[], estaciones: [] as string[], tarjetas: [] as string[] };
  let centralToken = "";
  let pilotToken = "";
  let cardA = "";
  let cardB = "";
  let plainStop = "";
  let stationStop = "";

  async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
    const [row] = (await dataSource.query(sql, params)) as T[];
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
    ids.employees.push(String(emp.id));
    const permissions = (
      (await dataSource.query(
        `SELECT p.codigo_permiso AS "codigo" FROM tbl_rol r
         JOIN tbl_rol_permiso rp ON rp.id_rol = r.id_rol
         JOIN tbl_permiso p ON p.id_permiso = rp.id_permiso WHERE r.codigo = $1`,
        [roleCode],
      )) as { codigo: string }[]
    ).map((r) => r.codigo);
    return jwt.sign(
      { employeeId: String(emp.id), email, roles: [roleCode], permissions, scope: { role: roleCode, modules: [] } },
      JWT_SECRET,
      { expiresIn: "12h" },
    );
  }

  async function createParada(name: string, withStation: boolean): Promise<string> {
    const parada = await one<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA') RETURNING id_parada AS "id"`,
      [`${runTag} ${name}`],
    );
    ids.paradas.push(String(parada.id));
    if (withStation) {
      const estacion = await one<{ id: string }>(
        `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
         VALUES ($1, 14.6, -90.5, 'ACTIVA', $2) RETURNING id_estacion AS "id"`,
        [`${runTag} Estación ${name}`, parada.id],
      );
      ids.estaciones.push(String(estacion.id));
    }
    return String(parada.id);
  }

  async function createCard(suffix: string, saldo: string, estado = "ACTIVA"): Promise<{ id: string; numero: string }> {
    const numero = `${runTag}-${suffix}`;
    const card = await one<{ id: string }>(
      `INSERT INTO tbl_tarjeta_ciudadana (numero_tarjeta, saldo, estado_tarjeta)
       VALUES ($1, $2, $3) RETURNING id_tarjeta_ciudadana AS "id"`,
      [numero, saldo, estado],
    );
    ids.tarjetas.push(String(card.id));
    return { id: String(card.id), numero };
  }

  // Inserts with explicit, increasing times so "newest first" is deterministic.
  async function pass(idTarjeta: string, idParada: string, tipo: string, monto: string, minute: number): Promise<string> {
    const row = await one<{ id: string }>(
      `INSERT INTO tbl_evento_talanquera (id_parada, id_tarjeta_ciudadana, tipo_evento, monto_cobrado, fecha_evento)
       VALUES ($1, $2, $3, $4, TIMESTAMPTZ '2026-10-01T10:00:00Z' + make_interval(mins => $5))
       RETURNING id_evento_talanquera AS "id"`,
      [idParada, idTarjeta, tipo, monto, minute],
    );
    return String(row.id);
  }

  async function payment(
    idTarjeta: string,
    referencia: string,
    monto: string,
    estado: string,
    minute: number,
    opts: { qpaypro?: string; receipt?: boolean } = {},
  ): Promise<string> {
    const tx = await one<{ id: string }>(
      `INSERT INTO tbl_transaccion_pago (id_tarjeta_ciudadana, referencia_pago, id_transaccion_qpaypro, monto_pago, estado_pago, fecha_transaccion)
       VALUES ($1, $2, $3, $4, $5, TIMESTAMPTZ '2026-10-01T10:00:00Z' + make_interval(mins => $6))
       RETURNING id_transaccion_pago AS "id"`,
      [idTarjeta, referencia, opts.qpaypro ?? null, monto, estado, minute],
    );
    if (opts.receipt) {
      const recarga = await one<{ id: string }>(
        `INSERT INTO tbl_recarga (id_transaccion_pago, id_tarjeta_ciudadana, monto_recarga)
         VALUES ($1, $2, $3) RETURNING id_recarga AS "id"`,
        [tx.id, idTarjeta, monto],
      );
      await dataSource.query(`INSERT INTO tbl_comprobante (id_recarga, numero_comprobante) VALUES ($1, $2)`, [
        recarga.id,
        `${referencia}-C`,
      ]);
    }
    return String(tx.id);
  }

  const api = () => request(app.getHttpServer());
  const get = (path: string, token = centralToken) => api().get(path).set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    centralToken = await createEmployee("OPERADOR_CENTRAL", "central");
    pilotToken = await createEmployee("PILOTO", "pilot");
    plainStop = await createParada("Norte", false);
    stationStop = await createParada("Centro", true);
    const a = await createCard("aaa", "12.50");
    const b = await createCard("bbb", "3.00", "BLOQUEADA");
    cardA = a.numero;
    cardB = b.numero;
    await pass(a.id, plainStop, "ENTRADA", "1.00", 1);
    await pass(a.id, stationStop, "SALIDA", "0.00", 2);
    await payment(a.id, `${runTag}-r1`, "20.00", "APROBADA", 3, { receipt: true });
    await payment(a.id, `${runTag}-r2`, "15.00", "PENDIENTE_AUTENTICACION", 4, { qpaypro: `${runTag}-qp` });
  });

  afterAll(async () => {
    if (dataSource) {
      const q = (sql: string, params: unknown[]) => dataSource.query(sql, params);
      if (ids.tarjetas.length) {
        await q(
          `DELETE FROM tbl_comprobante WHERE id_recarga IN (SELECT id_recarga FROM tbl_recarga WHERE id_tarjeta_ciudadana = ANY($1::bigint[]))`,
          [ids.tarjetas],
        );
        await q(`DELETE FROM tbl_recarga WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`, [ids.tarjetas]);
        await q(`DELETE FROM tbl_transaccion_pago WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`, [ids.tarjetas]);
        await q(`DELETE FROM tbl_evento_talanquera WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`, [ids.tarjetas]);
        await q(`DELETE FROM tbl_tarjeta_ciudadana WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`, [ids.tarjetas]);
      }
      if (ids.estaciones.length) await q(`DELETE FROM tbl_estacion WHERE id_estacion = ANY($1::bigint[])`, [ids.estaciones]);
      if (ids.paradas.length) await q(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [ids.paradas]);
      if (ids.employees.length) await q(`DELETE FROM tbl_empleado WHERE id_emple = ANY($1::bigint[])`, [ids.employees]);
    }
    if (app) await app.close();
  });

  describe("card list (S3)", () => {
    it("matches part of the number, case-insensitive, ordered by number, with the page info", async () => {
      const res = await get(`/cards?search=${encodeURIComponent(runTag.toLowerCase())}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        total: 2,
        page: 1,
        pageSize: 20,
        items: [
          { numeroTarjeta: cardA, saldo: 12.5, estadoTarjeta: "ACTIVA" },
          { numeroTarjeta: cardB, saldo: 3, estadoTarjeta: "BLOQUEADA" },
        ],
      });
    });

    it("pages 20 at a time", async () => {
      for (let i = 0; i < 20; i++) await createCard(`p${String(i).padStart(2, "0")}`, "0.00");

      const first = await get(`/cards?search=${encodeURIComponent(runTag)}&page=1`);
      const second = await get(`/cards?search=${encodeURIComponent(runTag)}&page=2`);

      expect(first.body.total).toBe(22);
      expect(first.body.items).toHaveLength(20);
      expect(second.body).toMatchObject({ total: 22, page: 2 });
      expect(second.body.items.map((c: { numeroTarjeta: string }) => c.numeroTarjeta)).toEqual([
        `${runTag}-p18`,
        `${runTag}-p19`,
      ]);
    });

    it("treats % and _ in the search as literal characters", async () => {
      const res = await get(`/cards?search=${encodeURIComponent(`${runTag}%`)}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    // Verifier probe: a page past the bound is a 400, never a database error.
    it.each(["page=1000001", "page=99999999999999999999"])("rejects the out-of-range %s with 400", async (query) => {
      expect((await get(`/cards?${query}`)).status).toBe(400);
    });

    it("accepts the last allowed page and returns it empty", async () => {
      const res = await get(`/cards?search=${encodeURIComponent(runTag)}&page=1000000`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total: 22, page: 1000000, items: [] });
    });

    it("treats a backslash in the search as a literal character", async () => {
      const res = await get(`/cards?search=${encodeURIComponent(`${runTag}\\`)}`);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it.each(["page=0", "page=abc", `search=${"x".repeat(51)}`])("rejects %s with 400", async (query) => {
      expect((await get(`/cards?${query}`)).status).toBe(400);
    });
  });

  describe("card activity (S4)", () => {
    it("returns the card, its passes and its payments, newest first", async () => {
      const res = await get(`/cards/${encodeURIComponent(cardA)}/activity`);

      expect(res.status).toBe(200);
      expect(res.body.tarjeta).toEqual({ numeroTarjeta: cardA, saldo: 12.5, estadoTarjeta: "ACTIVA" });
      expect(res.body.pasadas).toEqual([
        {
          idEvento: expect.any(String),
          tipo: "SALIDA",
          montoCobrado: 0,
          parada: { idParada: stationStop, nombreParada: `${runTag} Centro`, esEstacion: true },
          fecha: "2026-10-01T10:02:00.000Z",
        },
        {
          idEvento: expect.any(String),
          tipo: "ENTRADA",
          montoCobrado: 1,
          parada: { idParada: plainStop, nombreParada: `${runTag} Norte`, esEstacion: false },
          fecha: "2026-10-01T10:01:00.000Z",
        },
      ]);
      expect(res.body.recargas).toEqual([
        {
          idTransaccion: expect.any(String),
          referencia: `${runTag}-r2`,
          monto: 15,
          estadoPago: "PENDIENTE_AUTENTICACION",
          origen: "QPAYPRO",
          numeroComprobante: null,
          fecha: "2026-10-01T10:04:00.000Z",
        },
        {
          idTransaccion: expect.any(String),
          referencia: `${runTag}-r1`,
          monto: 20,
          estadoPago: "APROBADA",
          origen: "SIMULADA",
          numeroComprobante: `${runTag}-r1-C`,
          fecha: "2026-10-01T10:03:00.000Z",
        },
      ]);
    });

    it("returns empty lists for a card without activity", async () => {
      const res = await get(`/cards/${encodeURIComponent(cardB)}/activity`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        tarjeta: { numeroTarjeta: cardB, saldo: 3, estadoTarjeta: "BLOQUEADA" },
        pasadas: [],
        recargas: [],
      });
    });

    // qpaypro-checkout S8: a started QPayPro payment has no QPayPro id yet.
    it("marks a QPP- payment without a QPayPro id as QPAYPRO", async () => {
      const c = await createCard("qpp", "0.00");
      const referencia = `QPP-${randomUUID()}`;
      await payment(c.id, referencia, "25.00", "INICIADA", 5);

      const res = await get(`/cards/${encodeURIComponent(c.numero)}/activity`);

      expect(res.body.recargas).toEqual([
        {
          idTransaccion: expect.any(String),
          referencia,
          monto: 25,
          estadoPago: "INICIADA",
          origen: "QPAYPRO",
          numeroComprobante: null,
          fecha: "2026-10-01T10:05:00.000Z",
        },
      ]);
    });

    it("keeps only the newest 100 passes", async () => {
      const c = await createCard("many", "0.00");
      for (let i = 0; i < 105; i++) await pass(c.id, plainStop, "SALIDA", "0.00", i);

      const res = await get(`/cards/${encodeURIComponent(c.numero)}/activity`);

      expect(res.body.pasadas).toHaveLength(100);
      expect(res.body.pasadas[0].fecha).toBe("2026-10-01T11:44:00.000Z");
    });

    it("answers 404 with the spec message for an unknown card", async () => {
      const res = await get(`/cards/${runTag}-missing/activity`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("La tarjeta no existe.");
    });
  });

  describe("access (S2)", () => {
    it("requires a token and RECARGAS_REPORTES_CONSULTAR", async () => {
      expect((await api().get("/cards")).status).toBe(401);
      expect((await api().get(`/cards/${cardA}/activity`)).status).toBe(401);
      expect((await get("/cards", pilotToken)).status).toBe(403);
      expect((await get(`/cards/${encodeURIComponent(cardA)}/activity`, pilotToken)).status).toBe(403);
    });
  });
});
