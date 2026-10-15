// ============================================================================
// E2E for odd/tasks/user-web.md (S3-S6), against real Postgres: the public
// citizen endpoints used by apps/user-web. No login: the card number
// identifies the card. The simulated recharge writes the existing payment
// tables and is gated by RECHARGE_SIMULATOR_ENABLED.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Requires
// apps/api/.env exported and database/init.sql applied. Everything created
// here is removed in afterAll.
// ============================================================================

process.env.ADMIN_WEB_ORIGINS ??= "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID ??= "test-client-id";
process.env.RECHARGE_SIMULATOR_ENABLED = "true";

import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { DataSource } from "typeorm";

import { AppModule } from "../src/app.module.js";

describe("Citizen (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const runTag = `E2E-CIT-${Date.now()}`;
  const ids = { paradas: [] as string[], estaciones: [] as string[], tarjetas: [] as string[] };

  async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
    const [row] = (await dataSource.query(sql, params)) as T[];
    if (!row) throw new Error(`No row for: ${sql}`);
    return row;
  }

  async function createStation(name: string, estado: string): Promise<string> {
    const parada = await one<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA') RETURNING id_parada AS "id"`,
      [`${runTag} ${name}`],
    );
    ids.paradas.push(String(parada.id));
    const estacion = await one<{ id: string }>(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
       VALUES ($1, 14.6, -90.5, $2, $3) RETURNING id_estacion AS "id"`,
      [`${runTag} ${name}`, estado, parada.id],
    );
    ids.estaciones.push(String(estacion.id));
    return String(estacion.id);
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
  const recharge = (numero: string, body: Record<string, unknown>) =>
    api().post(`/citizen/cards/${encodeURIComponent(numero)}/recharges`).send(body);

  const saldoOf = async (numero: string) =>
    (await one<{ saldo: string }>(`SELECT saldo FROM tbl_tarjeta_ciudadana WHERE numero_tarjeta = $1`, [numero])).saldo;

  // tbl_transaccion_pago, tbl_recarga and tbl_comprobante rows of the run.
  const paymentRows = async () =>
    one<{ tx: string; recargas: string; comprobantes: string }>(
      `SELECT (SELECT COUNT(*) FROM tbl_transaccion_pago WHERE id_tarjeta_ciudadana = ANY($1::bigint[])) AS "tx",
              (SELECT COUNT(*) FROM tbl_recarga WHERE id_tarjeta_ciudadana = ANY($1::bigint[])) AS "recargas",
              (SELECT COUNT(*) FROM tbl_comprobante c JOIN tbl_recarga r ON r.id_recarga = c.id_recarga
                WHERE r.id_tarjeta_ciudadana = ANY($1::bigint[])) AS "comprobantes"`,
      [ids.tarjetas],
    );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource && ids.tarjetas.length) {
      const q = (sql: string) => dataSource.query(sql, [ids.tarjetas]);
      await q(
        `DELETE FROM tbl_comprobante WHERE id_recarga IN (SELECT id_recarga FROM tbl_recarga WHERE id_tarjeta_ciudadana = ANY($1::bigint[]))`,
      );
      await q(`DELETE FROM tbl_recarga WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`);
      await q(`DELETE FROM tbl_transaccion_pago WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`);
      await q(`DELETE FROM tbl_tarjeta_ciudadana WHERE id_tarjeta_ciudadana = ANY($1::bigint[])`);
    }
    if (dataSource && ids.estaciones.length) {
      await dataSource.query(`DELETE FROM tbl_estacion WHERE id_estacion = ANY($1::bigint[])`, [ids.estaciones]);
      await dataSource.query(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [ids.paradas]);
    }
    if (app) await app.close();
  });

  describe("card lookup (S3)", () => {
    it("returns number, balance and state without login", async () => {
      const card = await createCard("lookup", "12.50", "BLOQUEADA");

      const res = await api().get(`/citizen/cards/${encodeURIComponent(card)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ numeroTarjeta: card, saldo: 12.5, estadoTarjeta: "BLOQUEADA" });
    });

    it("answers 404 with the spec message for an unknown card", async () => {
      const res = await api().get(`/citizen/cards/${runTag}-missing`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("La tarjeta no existe.");
    });
  });

  describe("stations (S4)", () => {
    it("lists only ACTIVA stations by name, without login", async () => {
      const b = await createStation("B Activa", "ACTIVA");
      const a = await createStation("A Activa", "ACTIVA");
      const closed = await createStation("C Cerrada", "CERRADA");

      const res = await api().get("/citizen/stations");

      expect(res.status).toBe(200);
      const mine = (res.body as { idEstacion: string; nombreEstacion: string }[]).filter((s) =>
        s.nombreEstacion.startsWith(runTag),
      );
      expect(mine).toEqual([
        { idEstacion: a, nombreEstacion: `${runTag} A Activa` },
        { idEstacion: b, nombreEstacion: `${runTag} B Activa` },
      ]);
      expect(mine.map((s) => s.idEstacion)).not.toContain(closed);
    });
  });

  describe("simulated recharge (S5, S6)", () => {
    it("adds the amount and writes one transaction, recharge and receipt", async () => {
      const card = await createCard("rech", "2.00");
      const before = await paymentRows();

      const res = await recharge(card, { monto: 25.5, referencia: `${runTag}-r1` });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ monto: 25.5, saldo: 27.5, repetida: false });
      expect(res.body.numeroComprobante).toBe(`SIM-${res.body.idRecarga}`);
      expect(new Date(res.body.fechaRecarga).toISOString()).toBe(res.body.fechaRecarga);
      expect(await saldoOf(card)).toBe("27.50");
      const after = await paymentRows();
      expect(Number(after.tx)).toBe(Number(before.tx) + 1);
      expect(Number(after.recargas)).toBe(Number(before.recargas) + 1);
      expect(Number(after.comprobantes)).toBe(Number(before.comprobantes) + 1);
      const tx = await one<{ estado: string; moneda: string; ref: string; confirmada: Date | null; qpaypro: string | null }>(
        `SELECT estado_pago AS "estado", moneda, referencia_pago AS "ref", fecha_confirmacion AS "confirmada",
                id_transaccion_qpaypro AS "qpaypro"
           FROM tbl_transaccion_pago WHERE referencia_pago = $1`,
        [`${runTag}-r1`],
      );
      expect(tx).toMatchObject({ estado: "APROBADA", moneda: "GTQ", ref: `${runTag}-r1`, qpaypro: null });
      expect(tx.confirmada).not.toBeNull();
    });

    it("returns the original recharge for a retried referencia without charging again (200)", async () => {
      const card = await createCard("retry", "0.00");
      const first = await recharge(card, { monto: 10, referencia: `${runTag}-r2` });
      const before = await paymentRows();

      const retry = await recharge(card, { monto: 10, referencia: `${runTag}-r2` });

      expect(retry.status).toBe(200);
      expect(retry.body).toEqual({ ...first.body, repetida: true });
      expect(await saldoOf(card)).toBe("10.00");
      expect(await paymentRows()).toEqual(before);
    });

    it("rejects a referencia reused by another card or amount with 409 and changes nothing", async () => {
      const card = await createCard("reuse", "0.00");
      const other = await createCard("reuse-2", "0.00");
      await recharge(card, { monto: 10, referencia: `${runTag}-r3` });
      const before = await paymentRows();

      expect((await recharge(card, { monto: 11, referencia: `${runTag}-r3` })).status).toBe(409);
      expect((await recharge(other, { monto: 10, referencia: `${runTag}-r3` })).status).toBe(409);

      expect(await saldoOf(card)).toBe("10.00");
      expect(await saldoOf(other)).toBe("0.00");
      expect(await paymentRows()).toEqual(before);
    });

    it("rejects a card that is not ACTIVA (409) and an unknown card (404), changing nothing", async () => {
      const blocked = await createCard("rech-blocked", "5.00", "BLOQUEADA");
      const before = await paymentRows();

      const res = await recharge(blocked, { monto: 10, referencia: `${runTag}-r4` });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe("La tarjeta está BLOQUEADA y no puede recargarse.");
      expect((await recharge(`${runTag}-none`, { monto: 10, referencia: `${runTag}-r5` })).status).toBe(404);

      expect(await saldoOf(blocked)).toBe("5.00");
      expect(await paymentRows()).toEqual(before);
    });

    it.each([
      ["below the minimum", { monto: 0.99 }],
      ["above the maximum", { monto: 500.01 }],
      ["three decimals", { monto: 10.005 }],
      ["a string amount", { monto: "10" }],
      ["no amount", {}],
      ["a short referencia", { monto: 10, referencia: "abc" }],
      ["a referencia with spaces", { monto: 10, referencia: "has spaces 123" }],
    ])("rejects %s with 400 and changes nothing", async (_label, body) => {
      const card = await createCard(`bad-${_label.replace(/\W/g, "")}`, "5.00");
      const before = await paymentRows();

      const res = await recharge(card, { referencia: `${runTag}-bad-${_label.length}`, ...body });

      expect(res.status).toBe(400);
      expect(await saldoOf(card)).toBe("5.00");
      expect(await paymentRows()).toEqual(before);
    });

    it("accepts the bounds 1.00 and 500.00", async () => {
      const card = await createCard("bounds", "0.00");

      expect((await recharge(card, { monto: 1, referencia: `${runTag}-min` })).status).toBe(201);
      expect((await recharge(card, { monto: 500, referencia: `${runTag}-max` })).status).toBe(201);

      expect(await saldoOf(card)).toBe("501.00");
    });

    it("answers 404 and changes nothing while the simulator is disabled", async () => {
      const card = await createCard("rech-off", "5.00");
      const before = await paymentRows();
      process.env.RECHARGE_SIMULATOR_ENABLED = "false";
      try {
        expect((await recharge(card, { monto: 10, referencia: `${runTag}-off` })).status).toBe(404);
      } finally {
        process.env.RECHARGE_SIMULATOR_ENABLED = "true";
      }
      expect(await saldoOf(card)).toBe("5.00");
      expect(await paymentRows()).toEqual(before);
    });
  });
});
