// ============================================================================
// E2E for odd/tasks/afectaciones-activar-desactivar.md, against real Postgres.
//
// Unit specs mock the transaction, so only this suite proves with the real
// schema (chk_afectacion_objetivo, row locks, tbl_bitacora) that:
//   - S1/S4: POST /infrastructure/afectaciones changes the línea, parada or
//     estación state and stores the afectación with that target.
//   - S4: a no-op action (409) or an invalid target (400) stores nothing.
//   - S5: each applied afectación writes exactly one bitácora row.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Requires
// apps/api/.env exported and database/init.sql applied (tbl_afectacion.id_linea).
// Everything created here is removed in afterAll.
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
const OPERATOR_ROLE_CODE = "OPERADOR_CENTRAL";

describe("Afectaciones activar/desactivar (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let operatorId: string;
  let token: string;
  let lineaId: string;
  let paradaId: string;
  let estacionParadaId: string;
  let estacionId: string;
  let baselineAuditId = "0";
  let baselineAfectacionId = "0";

  const runTag = `E2E-AFE-${Date.now()}`;

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await dataSource.query(sql, params)) as T[];
  }

  function post(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post("/infrastructure/afectaciones")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  async function newAuditRows() {
    return rows<Record<string, unknown>>(
      `SELECT modulo, accion, entidad_tipo, entidad_id::text AS entidad_id, resultado,
              id_empleado::text AS id_empleado, detalle
         FROM tbl_bitacora WHERE id_bitacora > $1 AND id_empleado = $2 ORDER BY id_bitacora`,
      [baselineAuditId, operatorId],
    );
  }

  async function newAfectacionCount(): Promise<number> {
    const [row] = await rows<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tbl_afectacion WHERE id_afectacion > $1`,
      [baselineAfectacionId],
    );
    return row!.n;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    dataSource = moduleRef.get(DataSource);

    const [role] = await rows<{ idRol: string }>(
      `SELECT id_rol AS "idRol" FROM tbl_rol WHERE codigo = $1`,
      [OPERATOR_ROLE_CODE],
    );
    if (!role) throw new Error("Seed role missing — apply database/init.sql first");
    const email = `${runTag.toLowerCase()}-op@transmetro.gt`;
    const [emp] = await rows<{ id: string }>(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       VALUES ($1, 'ACTIVO', $2, $3) RETURNING id_emple AS "id"`,
      [`${runTag} Operator`, email, role.idRol],
    );
    operatorId = String(emp!.id);
    const permissions = (
      await rows<{ codigo: string }>(
        `SELECT p.codigo_permiso AS "codigo" FROM tbl_rol r
         JOIN tbl_rol_permiso rp ON rp.id_rol = r.id_rol
         JOIN tbl_permiso p ON p.id_permiso = rp.id_permiso WHERE r.codigo = $1`,
        [OPERATOR_ROLE_CODE],
      )
    ).map((r) => r.codigo);
    token = jwt.sign(
      {
        employeeId: operatorId,
        email,
        roles: [OPERATOR_ROLE_CODE],
        permissions,
        scope: { role: OPERATOR_ROLE_CODE, modules: [] },
      },
      JWT_SECRET,
      { expiresIn: "12h" },
    );

    const [linea] = await rows<{ id: string }>(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido)
       VALUES ('E2E', $1, '#123456', 'ACTIVA', 'LINEAL') RETURNING id_linea::text AS "id"`,
      [`${runTag} Línea`],
    );
    lineaId = linea!.id;
    const [parada] = await rows<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA') RETURNING id_parada::text AS "id"`,
      [`${runTag} Parada`],
    );
    paradaId = parada!.id;
    const [estacionParada] = await rows<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.61, -90.51, 'ACTIVA') RETURNING id_parada::text AS "id"`,
      [`${runTag} Parada estación`],
    );
    estacionParadaId = estacionParada!.id;
    const [estacion] = await rows<{ id: string }>(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
       VALUES ($1, 14.61, -90.51, 'MANTENIMIENTO', $2) RETURNING id_estacion::text AS "id"`,
      [`${runTag} Estación`, estacionParadaId],
    );
    estacionId = estacion!.id;

    const [maxAudit] = await rows<{ max: string | null }>(
      `SELECT MAX(id_bitacora)::text AS "max" FROM tbl_bitacora`,
    );
    baselineAuditId = maxAudit?.max ?? "0";
    const [maxAfectacion] = await rows<{ max: string | null }>(
      `SELECT MAX(id_afectacion)::text AS "max" FROM tbl_afectacion`,
    );
    baselineAfectacionId = maxAfectacion?.max ?? "0";
  });

  afterAll(async () => {
    if (dataSource) {
      await dataSource.query(`DELETE FROM tbl_bitacora WHERE id_bitacora > $1 AND id_empleado = $2`, [
        baselineAuditId,
        operatorId,
      ]);
      await dataSource.query(
        `DELETE FROM tbl_afectacion WHERE id_linea = $1 OR id_parada = ANY($2::bigint[]) OR id_estacion = $3`,
        [lineaId, [paradaId, estacionParadaId], estacionId],
      );
      if (estacionId) await dataSource.query(`DELETE FROM tbl_estacion WHERE id_estacion = $1`, [estacionId]);
      await dataSource.query(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [
        [paradaId, estacionParadaId].filter(Boolean),
      ]);
      if (lineaId) await dataSource.query(`DELETE FROM tbl_linea WHERE id_linea = $1`, [lineaId]);
      if (operatorId) await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = $1`, [operatorId]);
    }
    if (app) await app.close();
  });

  it("DESACTIVAR a línea sets it INACTIVA, stores the afectación and writes one bitácora row", async () => {
    const res = await post({
      accion: "DESACTIVAR",
      motivo: "Obra vial",
      fechaInicio: "2026-10-21",
      fechaFin: "2026-10-25",
      idLinea: lineaId,
    }).expect(201);

    expect(res.body).toMatchObject({
      accion: "DESACTIVAR",
      motivo: "Obra vial",
      idLinea: lineaId,
      idParada: null,
      idEstacion: null,
    });
    const idAfectacion = String(res.body.idAfectacion);

    const [linea] = await rows<{ estado: string }>(
      `SELECT estado_linea AS "estado" FROM tbl_linea WHERE id_linea = $1`,
      [lineaId],
    );
    expect(linea!.estado).toBe("INACTIVA");

    const stored = await rows<Record<string, unknown>>(
      `SELECT tipo_afectacion, motivo, estado_afectacion, id_linea::text AS id_linea, id_parada, id_estacion
         FROM tbl_afectacion WHERE id_afectacion = $1`,
      [idAfectacion],
    );
    expect(stored).toEqual([
      {
        tipo_afectacion: "DESACTIVAR",
        motivo: "Obra vial",
        estado_afectacion: "APLICADA",
        id_linea: lineaId,
        id_parada: null,
        id_estacion: null,
      },
    ]);

    expect(await newAuditRows()).toEqual([
      {
        modulo: "infrastructure",
        accion: "deactivate",
        entidad_tipo: "linea",
        entidad_id: lineaId,
        resultado: "EXITOSO",
        id_empleado: operatorId,
        detalle: {
          idAfectacion,
          motivo: "Obra vial",
          fechaInicio: "2026-10-21",
          fechaFin: "2026-10-25",
          estadoAnterior: "ACTIVA",
          estadoNuevo: "INACTIVA",
        },
      },
    ]);
  });

  it("DESACTIVAR the already inactive línea is 409 and stores nothing", async () => {
    const afectacionesBefore = await newAfectacionCount();
    const auditBefore = (await newAuditRows()).length;

    const res = await post({
      accion: "DESACTIVAR",
      motivo: "Otra vez",
      fechaInicio: "2026-10-22",
      idLinea: lineaId,
    }).expect(409);

    expect(res.body.message).toBe("La línea ya está inactiva");
    expect(await newAfectacionCount()).toBe(afectacionesBefore);
    expect((await newAuditRows()).length).toBe(auditBefore);
  });

  it("ACTIVAR the línea again restores ACTIVA (manual revert)", async () => {
    await post({ accion: "ACTIVAR", motivo: "Fin de obra", fechaInicio: "2026-10-25", idLinea: lineaId }).expect(201);

    const [linea] = await rows<{ estado: string }>(
      `SELECT estado_linea AS "estado" FROM tbl_linea WHERE id_linea = $1`,
      [lineaId],
    );
    expect(linea!.estado).toBe("ACTIVA");
    const audit = await newAuditRows();
    expect(audit.at(-1)).toMatchObject({ accion: "activate", entidad_tipo: "linea", entidad_id: lineaId });
  });

  it("DESACTIVAR a parada sets it CERRADA", async () => {
    await post({ accion: "DESACTIVAR", motivo: "Inundación", fechaInicio: "2026-10-21", idParada: paradaId }).expect(201);

    const [parada] = await rows<{ estado: string }>(
      `SELECT estado_parada AS "estado" FROM tbl_parada WHERE id_parada = $1`,
      [paradaId],
    );
    expect(parada!.estado).toBe("CERRADA");
    expect((await newAuditRows()).at(-1)).toMatchObject({
      accion: "deactivate",
      entidad_tipo: "parada",
      entidad_id: paradaId,
    });
  });

  it("ACTIVAR an estación in MANTENIMIENTO sets it ACTIVA", async () => {
    await post({ accion: "ACTIVAR", motivo: "Reabierta", fechaInicio: "2026-10-21", idEstacion: estacionId }).expect(201);

    const [estacion] = await rows<{ estado: string }>(
      `SELECT estado_estacion AS "estado" FROM tbl_estacion WHERE id_estacion = $1`,
      [estacionId],
    );
    expect(estacion!.estado).toBe("ACTIVA");
    expect((await newAuditRows()).at(-1)).toMatchObject({
      accion: "activate",
      entidad_tipo: "estacion",
      entidad_id: estacionId,
      detalle: expect.objectContaining({ estadoAnterior: "MANTENIMIENTO", estadoNuevo: "ACTIVA" }),
    });
  });

  it.each([
    ["two targets", (ids: { l: string; p: string }) => ({ idLinea: ids.l, idParada: ids.p })],
    ["no target", () => ({})],
  ])("%s is 400 and stores nothing", async (_label, targets) => {
    const afectacionesBefore = await newAfectacionCount();
    const auditBefore = (await newAuditRows()).length;

    const res = await post({
      accion: "DESACTIVAR",
      motivo: "Inválida",
      fechaInicio: "2026-10-21",
      ...targets({ l: lineaId, p: paradaId }),
    }).expect(400);

    expect(res.body.message).toBe("Debe proporcionar exactamente uno: idLinea, idParada o idEstacion");
    expect(await newAfectacionCount()).toBe(afectacionesBefore);
    expect((await newAuditRows()).length).toBe(auditBefore);
  });

  // Hashes every table a rejected request could touch.
  async function snapshot(): Promise<string> {
    const q = async (sql: string, params: unknown[] = []) => JSON.stringify(await rows(sql, params));
    return [
      await q(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id_afectacion), '')) h FROM tbl_afectacion t`),
      await q(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id_bitacora), '')) h FROM tbl_bitacora t`),
      await q(`SELECT estado_linea FROM tbl_linea WHERE id_linea = $1`, [lineaId]),
      await q(
        `SELECT id_parada, estado_parada FROM tbl_parada WHERE id_parada = ANY($1::bigint[]) ORDER BY 1`,
        [[paradaId, estacionParadaId]],
      ),
      await q(`SELECT estado_estacion FROM tbl_estacion WHERE id_estacion = $1`, [estacionId]),
    ].join("\n");
  }

  const base = { accion: "DESACTIVAR", motivo: "m", fechaInicio: "2026-10-21" };
  it.each<[string, () => Record<string, unknown>, number, string | null]>([
    ["missing línea", () => ({ ...base, idLinea: "999999999" }), 404, "Línea con ID 999999999 no encontrada"],
    ["missing parada", () => ({ ...base, idParada: "999999999" }), 404, "Parada con ID 999999999 no encontrada"],
    ["missing estación", () => ({ ...base, idEstacion: "999999999" }), 404, "Estación con ID 999999999 no encontrada"],
    [
      "fechaFin before fechaInicio",
      () => ({ ...base, fechaFin: "2026-10-20", idLinea: lineaId }),
      400,
      "La fecha de fin no puede ser anterior a la fecha de inicio",
    ],
    [
      "three targets",
      () => ({ ...base, idLinea: lineaId, idParada: paradaId, idEstacion: estacionId }),
      400,
      "Debe proporcionar exactamente uno: idLinea, idParada o idEstacion",
    ],
    ["blank motivo", () => ({ ...base, motivo: "   ", idLinea: lineaId }), 400, null],
    ["legacy accion", () => ({ ...base, accion: "TEMPORAL", idLinea: lineaId }), 400, null],
    ["datetime fechaInicio", () => ({ ...base, fechaInicio: "2026-10-21T15:30:00Z", idLinea: lineaId }), 400, null],
    ["negative id", () => ({ ...base, idLinea: "-1" }), 400, null],
    ["active parada", () => ({ ...base, accion: "ACTIVAR", idParada: estacionParadaId }), 409, "La parada ya está activa"],
  ])("%s is rejected and changes nothing", async (_label, body, status, message) => {
    const before = await snapshot();

    const res = await post(body());

    expect(res.status).toBe(status);
    if (message) expect(res.body.message).toBe(message);
    expect(await snapshot()).toBe(before);
  });

  it("PATCH and DELETE are no longer routes", async () => {
    await request(app.getHttpServer())
      .patch("/infrastructure/afectaciones/1/close")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch("/infrastructure/afectaciones/1")
      .set("Authorization", `Bearer ${token}`)
      .send({ motivo: "x" })
      .expect(404);
    await request(app.getHttpServer())
      .delete("/infrastructure/afectaciones/1")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("GET lists afectaciones with their action and target", async () => {
    const res = await request(app.getHttpServer())
      .get("/infrastructure/afectaciones")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const mine = (res.body as Array<Record<string, unknown>>).filter((a) => a.idLinea === lineaId);
    expect(mine.map((a) => a.accion).sort()).toEqual(["ACTIVAR", "DESACTIVAR"]);
  });
});
