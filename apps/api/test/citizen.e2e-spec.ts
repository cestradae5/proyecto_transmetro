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
  const ids = { paradas: [] as string[], estaciones: [] as string[], tarjetas: [] as string[], lineas: [] as string[] };

  async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
    const [row] = (await dataSource.query(sql, params)) as T[];
    if (!row) throw new Error(`No row for: ${sql}`);
    return row;
  }

  async function createParada(name: string, estado: string, withStation = false): Promise<string> {
    const parada = await one<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, $2) RETURNING id_parada AS "id"`,
      [`${runTag} ${name}`, estado],
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

  // A line whose route is the given paradas, in order.
  async function createLine(suffix: string, estado: string, route: string[]): Promise<string> {
    const linea = await one<{ id: string }>(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido)
       VALUES ($1, $2, '#FF6600', $3, 'LINEAL') RETURNING id_linea AS "id"`,
      [`${runTag.slice(-10)}${suffix}`, `${runTag} Línea ${suffix}`, estado],
    );
    ids.lineas.push(String(linea.id));
    for (const [index, idParada] of route.entries()) {
      await dataSource.query(
        `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea) VALUES ($1, 3, $2, $3)`,
        [index + 1, idParada, linea.id],
      );
    }
    return String(linea.id);
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
    if (dataSource && ids.lineas.length) {
      await dataSource.query(`DELETE FROM tbl_linea_parada WHERE id_linea = ANY($1::bigint[])`, [ids.lineas]);
      await dataSource.query(`DELETE FROM tbl_linea WHERE id_linea = ANY($1::bigint[])`, [ids.lineas]);
    }
    if (dataSource && ids.estaciones.length) {
      await dataSource.query(`DELETE FROM tbl_estacion WHERE id_estacion = ANY($1::bigint[])`, [ids.estaciones]);
    }
    if (dataSource && ids.paradas.length) {
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

  // odd/tasks/parada-ridership.md S1, S9: every active parada, grouped by its
  // active lines in route order; stations are paradas marked esEstacion.
  describe("lines with paradas (parada-ridership S9)", () => {
    type Linea = {
      idLinea: string | null;
      numeroLinea: string | null;
      nombreLinea: string;
      paradas: { idParada: string; nombreParada: string; orden: number | null; esEstacion: boolean }[];
    };

    it("lists active lines with their active paradas in route order and the rest under 'Sin línea'", async () => {
      const centro = await createParada("Centro", "ACTIVA", true);
      const norte = await createParada("Norte", "ACTIVA");
      const cerrada = await createParada("Cerrada", "CERRADA");
      const sur = await createParada("Sur", "ACTIVA");
      const aislada = await createParada("Aislada", "ACTIVA");
      // Route order Norte -> Cerrada -> Centro; Centro is shared with line B.
      const lineA = await createLine("A", "ACTIVA", [norte, cerrada, centro]);
      const lineB = await createLine("B", "ACTIVA", [centro]);
      // Sur is only on an inactive line, so it has no active line.
      await createLine("C", "INACTIVA", [sur]);

      const res = await api().get("/citizen/lines");

      expect(res.status).toBe(200);
      const body = res.body as Linea[];
      const mine = body.filter((l) => l.idLinea !== null && ids.lineas.includes(l.idLinea));
      expect(mine).toEqual([
        {
          idLinea: lineA,
          numeroLinea: `${runTag.slice(-10)}A`,
          nombreLinea: `${runTag} Línea A`,
          paradas: [
            { idParada: norte, nombreParada: `${runTag} Norte`, orden: 1, esEstacion: false },
            { idParada: centro, nombreParada: `${runTag} Centro`, orden: 3, esEstacion: true },
          ],
        },
        {
          idLinea: lineB,
          numeroLinea: `${runTag.slice(-10)}B`,
          nombreLinea: `${runTag} Línea B`,
          paradas: [{ idParada: centro, nombreParada: `${runTag} Centro`, orden: 1, esEstacion: true }],
        },
      ]);
      const last = body[body.length - 1]!;
      expect(last).toMatchObject({ idLinea: null, numeroLinea: null, nombreLinea: "Sin línea" });
      expect(last.paradas.filter((p) => p.nombreParada.startsWith(runTag))).toEqual([
        { idParada: aislada, nombreParada: `${runTag} Aislada`, orden: null, esEstacion: false },
        { idParada: sur, nombreParada: `${runTag} Sur`, orden: null, esEstacion: false },
      ]);
      const everyParada = body.flatMap((l) => l.paradas.map((p) => p.idParada));
      expect(everyParada).not.toContain(cerrada);
    });

    it("no longer serves /citizen/stations", async () => {
      expect((await api().get("/citizen/stations")).status).toBe(404);
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

    // qpaypro-checkout S8: QPP- referencias are generated for QPayPro payments.
    it("rejects a referencia starting with QPP- with 400 and changes nothing", async () => {
      const card = await createCard("qpp-ref", "5.00");
      const before = await paymentRows();

      const res = await recharge(card, { monto: 10, referencia: `QPP-${runTag}` });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(["referencia must not start with QPP- (reserved for QPayPro)"]);
      expect(await saldoOf(card)).toBe("5.00");
      expect(await paymentRows()).toEqual(before);
    });

    // Verifier probe: the client cannot set the balance; unknown fields are
    // stripped by the global ValidationPipe whitelist.
    it("ignores a saldo sent in the body", async () => {
      const card = await createCard("extra", "5.00");
      const before = await paymentRows();

      const res = await recharge(card, { monto: 10, referencia: `${runTag}-extra`, saldo: 9999 });

      expect(res.status).toBe(201);
      expect(res.body.saldo).toBe(15);
      expect(await saldoOf(card)).toBe("15.00");
      expect(Number((await paymentRows()).tx)).toBe(Number(before.tx) + 1);
    });

    it("answers 404 and changes nothing when the simulator flag is unset", async () => {
      const card = await createCard("rech-unset", "5.00");
      const before = await paymentRows();
      delete process.env.RECHARGE_SIMULATOR_ENABLED;
      try {
        expect((await recharge(card, { monto: 10, referencia: `${runTag}-unset` })).status).toBe(404);
      } finally {
        process.env.RECHARGE_SIMULATOR_ENABLED = "true";
      }
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
