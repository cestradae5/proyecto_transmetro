// ============================================================================
// E2E for odd/tasks/afectaciones-activar-desactivar.md, against real Postgres.
//
// Unit specs run over an in-memory store, so only this suite proves with the
// real schema (chk_afectacion_objetivo, tbl_afectacion_cambio, row locks,
// tbl_bitacora) that:
//   - S1/S4: POST /infrastructure/afectaciones changes the línea, parada or
//     estación state and stores the afectación with that target.
//   - S4: a no-op action (409) or an invalid target (400) stores nothing.
//   - S5/S11: each application writes one activate/deactivate bitácora row
//     whose detalle.cascada lists the cascaded changes; an edit adds an
//     `update` row; rejected requests write nothing.
//   - S6-S9: municipalidad and línea deactivations cascade to their exclusive
//     líneas/paradas/estaciones, also from the Municipalidades delete/estado
//     edit, and ACTIVAR restores only what is still in the cascade's state.
//   - S10: PATCH edits motivo/fechas and re-applies a changed acción.
//
// `npm run test:e2e` hardcodes DATABASE_NAME=transmetro_test. Requires
// apps/api/.env exported and database/init.sql applied (tbl_afectacion_cambio).
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

const TABLES = {
  municipalidad: ["tbl_municipalidad", "id_municipalidad", "estado_municipalidad"],
  linea: ["tbl_linea", "id_linea", "estado_linea"],
  parada: ["tbl_parada", "id_parada", "estado_parada"],
  estacion: ["tbl_estacion", "id_estacion", "estado_estacion"],
} as const;
type Tipo = keyof typeof TABLES;

const cambio = (entidadTipo: Tipo, entidadId: string, estadoAnterior: string, estadoNuevo: string) => ({
  entidadTipo,
  entidadId,
  estadoAnterior,
  estadoNuevo,
});

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

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
  const created = {
    municipalidades: [] as string[],
    lineas: [] as string[],
    paradas: [] as string[],
    estaciones: [] as string[],
  };
  let numeroSeq = 0;

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await dataSource.query(sql, params)) as T[];
  }

  function post(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post("/infrastructure/afectaciones")
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  function patch(id: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .patch(`/infrastructure/afectaciones/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  async function insertMunicipalidad(nombre: string, estadoInicial = "ACTIVA"): Promise<string> {
    const [row] = await rows<{ id: string }>(
      `INSERT INTO tbl_municipalidad (nombre_municipalidad, departamento, estado_municipalidad)
       VALUES ($1, 'Guatemala', $2) RETURNING id_municipalidad::text AS "id"`,
      [`${runTag} ${nombre}`, estadoInicial],
    );
    created.municipalidades.push(row!.id);
    return row!.id;
  }

  async function insertLinea(nombre: string, estadoInicial = "ACTIVA", municipalidades: string[] = []): Promise<string> {
    const numero = `E${String(Date.now()).slice(-6)}${numeroSeq++}`;
    const [row] = await rows<{ id: string }>(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido)
       VALUES ($1, $2, '#123456', $3, 'LINEAL') RETURNING id_linea::text AS "id"`,
      [numero, `${runTag} ${nombre}`, estadoInicial],
    );
    created.lineas.push(row!.id);
    for (const m of municipalidades) {
      await rows(`INSERT INTO tbl_linea_municipalidad (id_linea, id_municipalidad) VALUES ($1, $2)`, [row!.id, m]);
    }
    return row!.id;
  }

  async function insertParada(nombre: string, estadoInicial = "ACTIVA", lineas: string[] = []): Promise<string> {
    const [row] = await rows<{ id: string }>(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, $2) RETURNING id_parada::text AS "id"`,
      [`${runTag} ${nombre}`, estadoInicial],
    );
    created.paradas.push(row!.id);
    for (const l of lineas) {
      await rows(
        `INSERT INTO tbl_linea_parada (orden, minutos_hasta_siguiente, id_parada, id_linea)
         VALUES ((SELECT COALESCE(MAX(orden), 0) + 1 FROM tbl_linea_parada WHERE id_linea = $2), 5, $1, $2)`,
        [row!.id, l],
      );
    }
    return row!.id;
  }

  async function insertEstacion(
    nombre: string,
    idParada: string,
    estadoInicial = "ACTIVA",
    lineas: string[] = [],
  ): Promise<string> {
    const [row] = await rows<{ id: string }>(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
       VALUES ($1, 14.6, -90.5, $2, $3) RETURNING id_estacion::text AS "id"`,
      [`${runTag} ${nombre}`, estadoInicial, idParada],
    );
    created.estaciones.push(row!.id);
    for (const l of lineas) {
      await rows(
        `INSERT INTO tbl_estacion_linea (id_linea, id_estacion, tipo_punto, estado_asignacion)
         VALUES ($1, $2, 'PRINCIPAL', 'ACTIVA')`,
        [l, row!.id],
      );
    }
    return row!.id;
  }

  async function estado(tipo: Tipo, id: string): Promise<string> {
    const [table, idCol, estadoCol] = TABLES[tipo];
    const [row] = await rows<{ estado: string }>(`SELECT ${estadoCol} AS estado FROM ${table} WHERE ${idCol} = $1`, [id]);
    return row!.estado;
  }

  async function newAuditRows() {
    return rows<Record<string, unknown>>(
      `SELECT modulo, accion, entidad_tipo, entidad_id::text AS entidad_id, resultado,
              id_empleado::text AS id_empleado, detalle
         FROM tbl_bitacora WHERE id_bitacora > $1 AND id_empleado = $2 ORDER BY id_bitacora`,
      [baselineAuditId, operatorId],
    );
  }

  async function auditMark(): Promise<string> {
    const [row] = await rows<{ max: string | null }>(`SELECT MAX(id_bitacora)::text AS "max" FROM tbl_bitacora`);
    return row?.max ?? "0";
  }

  async function auditSince(mark: string) {
    return rows<Record<string, unknown>>(
      `SELECT accion, entidad_tipo, entidad_id::text AS entidad_id, detalle
         FROM tbl_bitacora WHERE id_bitacora > $1 AND id_empleado = $2 ORDER BY id_bitacora`,
      [mark, operatorId],
    );
  }

  async function storedCambios(idAfectacion: string) {
    return rows<Record<string, unknown>>(
      `SELECT entidad_tipo AS "entidadTipo", entidad_id::text AS "entidadId", estado_anterior AS "estadoAnterior",
              estado_nuevo AS "estadoNuevo", revertido
         FROM tbl_afectacion_cambio WHERE id_afectacion = $1 ORDER BY id_afectacion_cambio`,
      [idAfectacion],
    );
  }

  async function newAfectacionCount(): Promise<number> {
    const [row] = await rows<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM tbl_afectacion WHERE id_afectacion > $1`,
      [baselineAfectacionId],
    );
    return row!.n;
  }

  // Hashes every table a rejected request could touch (bitácora rows of this
  // suite's operator only: other e2e files may write concurrently).
  async function snapshot(): Promise<string> {
    const q = async (sql: string, params: unknown[] = []) => JSON.stringify(await rows(sql, params));
    const ids = (tipo: Tipo) =>
      ({ municipalidad: created.municipalidades, linea: created.lineas, parada: created.paradas, estacion: created.estaciones })[tipo];
    const parts = [
      await q(`SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id_afectacion), '')) h FROM tbl_afectacion t`),
      await q(
        `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id_afectacion_cambio), '')) h FROM tbl_afectacion_cambio t`,
      ),
      await q(
        `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id_bitacora), '')) h FROM tbl_bitacora t WHERE id_empleado = $1`,
        [operatorId],
      ),
    ];
    for (const tipo of Object.keys(TABLES) as Tipo[]) {
      const [table, idCol, estadoCol] = TABLES[tipo];
      parts.push(
        await q(`SELECT ${idCol}, ${estadoCol} FROM ${table} WHERE ${idCol} = ANY($1::bigint[]) ORDER BY 1`, [ids(tipo)]),
      );
    }
    return parts.join("\n");
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

    lineaId = await insertLinea("Línea");
    paradaId = await insertParada("Parada");
    estacionParadaId = await insertParada("Parada estación");
    estacionId = await insertEstacion("Estación", estacionParadaId, "MANTENIMIENTO");

    baselineAuditId = await auditMark();
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
      const { municipalidades: m, lineas: l, paradas: p, estaciones: e } = created;
      const mine = `SELECT id_afectacion FROM tbl_afectacion
         WHERE id_municipalidad = ANY($1::bigint[]) OR id_linea = ANY($2::bigint[])
            OR id_parada = ANY($3::bigint[]) OR id_estacion = ANY($4::bigint[])`;
      await dataSource.query(`DELETE FROM tbl_afectacion_cambio WHERE id_afectacion IN (${mine})`, [m, l, p, e]);
      await dataSource.query(`DELETE FROM tbl_afectacion WHERE id_afectacion IN (${mine})`, [m, l, p, e]);
      await dataSource.query(`DELETE FROM tbl_estacion_linea WHERE id_linea = ANY($1::bigint[])`, [l]);
      await dataSource.query(`DELETE FROM tbl_linea_parada WHERE id_linea = ANY($1::bigint[])`, [l]);
      await dataSource.query(`DELETE FROM tbl_linea_municipalidad WHERE id_linea = ANY($1::bigint[])`, [l]);
      await dataSource.query(`DELETE FROM tbl_estacion WHERE id_estacion = ANY($1::bigint[])`, [e]);
      await dataSource.query(`DELETE FROM tbl_parada WHERE id_parada = ANY($1::bigint[])`, [p]);
      await dataSource.query(`DELETE FROM tbl_linea WHERE id_linea = ANY($1::bigint[])`, [l]);
      await dataSource.query(`DELETE FROM tbl_municipalidad WHERE id_municipalidad = ANY($1::bigint[])`, [m]);
      if (operatorId) await dataSource.query(`DELETE FROM tbl_empleado WHERE id_emple = $1`, [operatorId]);
    }
    if (app) await app.close();
  });

  describe("single targets (S1-S5)", () => {
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
        idMunicipalidad: null,
        idLinea: lineaId,
        idParada: null,
        idEstacion: null,
        cambios: [{ ...cambio("linea", lineaId, "ACTIVA", "INACTIVA"), revertido: false }],
      });
      const idAfectacion = String(res.body.idAfectacion);

      expect(await estado("linea", lineaId)).toBe("INACTIVA");

      const stored = await rows<Record<string, unknown>>(
        `SELECT tipo_afectacion, motivo, estado_afectacion, id_linea::text AS id_linea, id_parada, id_estacion, id_municipalidad
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
          id_municipalidad: null,
        },
      ]);
      expect(await storedCambios(idAfectacion)).toEqual([
        { ...cambio("linea", lineaId, "ACTIVA", "INACTIVA"), revertido: false },
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
            cascada: [],
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

      expect(await estado("linea", lineaId)).toBe("ACTIVA");
      const audit = await newAuditRows();
      expect(audit.at(-1)).toMatchObject({ accion: "activate", entidad_tipo: "linea", entidad_id: lineaId });
    });

    it("DESACTIVAR a parada sets it CERRADA", async () => {
      await post({ accion: "DESACTIVAR", motivo: "Inundación", fechaInicio: "2026-10-21", idParada: paradaId }).expect(201);

      expect(await estado("parada", paradaId)).toBe("CERRADA");
      expect((await newAuditRows()).at(-1)).toMatchObject({
        accion: "deactivate",
        entidad_tipo: "parada",
        entidad_id: paradaId,
      });
    });

    it("ACTIVAR an estación in MANTENIMIENTO sets it ACTIVA", async () => {
      await post({ accion: "ACTIVAR", motivo: "Reabierta", fechaInicio: "2026-10-21", idEstacion: estacionId }).expect(201);

      expect(await estado("estacion", estacionId)).toBe("ACTIVA");
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

      expect(res.body.message).toBe("Debe proporcionar exactamente uno: idMunicipalidad, idLinea, idParada o idEstacion");
      expect(await newAfectacionCount()).toBe(afectacionesBefore);
      expect((await newAuditRows()).length).toBe(auditBefore);
    });

    const base = { accion: "DESACTIVAR", motivo: "m", fechaInicio: "2026-10-21" };
    const TARGET_MESSAGE = "Debe proporcionar exactamente uno: idMunicipalidad, idLinea, idParada o idEstacion";
    it.each<[string, () => Record<string, unknown>, number, string | null]>([
      ["missing municipalidad", () => ({ ...base, idMunicipalidad: "999999999" }), 404, "Municipalidad con ID 999999999 no encontrada"],
      ["missing línea", () => ({ ...base, idLinea: "999999999" }), 404, "Línea con ID 999999999 no encontrada"],
      ["missing parada", () => ({ ...base, idParada: "999999999" }), 404, "Parada con ID 999999999 no encontrada"],
      ["missing estación", () => ({ ...base, idEstacion: "999999999" }), 404, "Estación con ID 999999999 no encontrada"],
      [
        "fechaFin before fechaInicio",
        () => ({ ...base, fechaFin: "2026-10-20", idLinea: lineaId }),
        400,
        "La fecha de fin no puede ser anterior a la fecha de inicio",
      ],
      ["three targets", () => ({ ...base, idLinea: lineaId, idParada: paradaId, idEstacion: estacionId }), 400, TARGET_MESSAGE],
      ["municipalidad and línea", () => ({ ...base, idMunicipalidad: "1", idLinea: lineaId }), 400, TARGET_MESSAGE],
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

    it("close and DELETE are not routes", async () => {
      await request(app.getHttpServer())
        .patch("/infrastructure/afectaciones/1/close")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
      await request(app.getHttpServer())
        .delete("/infrastructure/afectaciones/1")
        .set("Authorization", `Bearer ${token}`)
        .expect(404);
    });

    it("GET lists afectaciones with their action, target and cambios", async () => {
      const res = await request(app.getHttpServer())
        .get("/infrastructure/afectaciones")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      const mine = (res.body as Array<Record<string, unknown>>).filter((a) => a.idLinea === lineaId);
      expect(mine.map((a) => a.accion).sort()).toEqual(["ACTIVAR", "DESACTIVAR"]);
      for (const a of mine) {
        expect(a.idMunicipalidad).toBeNull();
        expect(a.cambios).toEqual([expect.objectContaining({ entidadTipo: "linea", entidadId: lineaId })]);
      }
    });
  });

  // The Villa Nueva report (L7): a municipalidad with one exclusive línea that
  // has an exclusive parada (with estación) and a parada shared with another
  // municipalidad's ACTIVA línea. Already-inactive rows must stay inactive.
  describe("Villa Nueva: municipalidad cascade and edit (S6-S11)", () => {
    let muni: string;
    let otraMuni: string;
    let linea: string;
    let lineaInactiva: string;
    let lineaOtra: string;
    let paradaExclusiva: string;
    let estacionExclusiva: string;
    let paradaCompartida: string;
    let paradaCerrada: string;
    let idDesactivacion: string;

    beforeAll(async () => {
      muni = await insertMunicipalidad("Villa Nueva");
      otraMuni = await insertMunicipalidad("Mixco");
      linea = await insertLinea("Villa Nueva 1", "ACTIVA", [muni]);
      lineaInactiva = await insertLinea("Villa Nueva 2", "INACTIVA", [muni]);
      lineaOtra = await insertLinea("Mixco 1", "ACTIVA", [otraMuni]);
      paradaExclusiva = await insertParada("VN exclusiva", "ACTIVA", [linea]);
      estacionExclusiva = await insertEstacion("VN estación", paradaExclusiva);
      paradaCompartida = await insertParada("VN compartida", "ACTIVA", [linea, lineaOtra]);
      paradaCerrada = await insertParada("VN ya cerrada", "CERRADA", [linea]);
    });

    async function estados() {
      return {
        muni: await estado("municipalidad", muni),
        linea: await estado("linea", linea),
        lineaInactiva: await estado("linea", lineaInactiva),
        lineaOtra: await estado("linea", lineaOtra),
        paradaExclusiva: await estado("parada", paradaExclusiva),
        estacionExclusiva: await estado("estacion", estacionExclusiva),
        paradaCompartida: await estado("parada", paradaCompartida),
        paradaCerrada: await estado("parada", paradaCerrada),
      };
    }

    const desactivados = {
      muni: "INACTIVA",
      linea: "INACTIVA",
      lineaInactiva: "INACTIVA",
      lineaOtra: "ACTIVA",
      paradaExclusiva: "CERRADA",
      estacionExclusiva: "CERRADA",
      paradaCompartida: "ACTIVA",
      paradaCerrada: "CERRADA",
    };
    const activos = { ...desactivados, muni: "ACTIVA", linea: "ACTIVA", paradaExclusiva: "ACTIVA", estacionExclusiva: "ACTIVA" };

    it("DESACTIVAR the municipalidad takes down its exclusive línea, parada and estación only", async () => {
      const mark = await auditMark();

      const res = await post({
        accion: "DESACTIVAR",
        motivo: "Cierre municipal",
        fechaInicio: "2026-10-21",
        idMunicipalidad: muni,
      }).expect(201);
      idDesactivacion = String(res.body.idAfectacion);

      const cascada = [
        cambio("linea", linea, "ACTIVA", "INACTIVA"),
        cambio("parada", paradaExclusiva, "ACTIVA", "CERRADA"),
        cambio("estacion", estacionExclusiva, "ACTIVA", "CERRADA"),
      ];
      expect(res.body).toMatchObject({ accion: "DESACTIVAR", idMunicipalidad: muni, idLinea: null });
      expect(res.body.cambios).toEqual(
        [cambio("municipalidad", muni, "ACTIVA", "INACTIVA"), ...cascada].map((c) => ({ ...c, revertido: false })),
      );
      expect(await estados()).toEqual(desactivados);
      expect(await storedCambios(idDesactivacion)).toEqual(res.body.cambios);
      expect(await auditSince(mark)).toEqual([
        {
          accion: "deactivate",
          entidad_tipo: "municipalidad",
          entidad_id: muni,
          detalle: {
            idAfectacion: idDesactivacion,
            motivo: "Cierre municipal",
            fechaInicio: "2026-10-21",
            fechaFin: null,
            estadoAnterior: "ACTIVA",
            estadoNuevo: "INACTIVA",
            cascada,
          },
        },
      ]);
    });

    it("rejected edits (merged fechas, missing afectación) change nothing", async () => {
      const before = await snapshot();

      const fechas = await patch(idDesactivacion, { fechaFin: "2026-10-20" }).expect(400);
      expect(fechas.body.message).toBe("La fecha de fin no puede ser anterior a la fecha de inicio");
      const missing = await patch("999999999", { motivo: "x" }).expect(404);
      expect(missing.body.message).toBe("Afectación con ID 999999999 no encontrada");
      await patch(idDesactivacion, { fechaInicio: null }).expect(400);

      expect(await snapshot()).toBe(before);
    });

    it("editing the afectación to ACTIVAR brings everything back; earlier-inactive rows stay inactive", async () => {
      const mark = await auditMark();

      const res = await patch(idDesactivacion, { accion: "ACTIVAR" }).expect(200);

      const restaurados = [
        cambio("linea", linea, "INACTIVA", "ACTIVA"),
        cambio("parada", paradaExclusiva, "CERRADA", "ACTIVA"),
        cambio("estacion", estacionExclusiva, "CERRADA", "ACTIVA"),
      ];
      expect(await estados()).toEqual(activos);
      expect(res.body).toMatchObject({ idAfectacion: idDesactivacion, accion: "ACTIVAR", idMunicipalidad: muni });
      expect(res.body.cambios).toEqual([
        { ...cambio("municipalidad", muni, "ACTIVA", "INACTIVA"), revertido: true },
        { ...cambio("linea", linea, "ACTIVA", "INACTIVA"), revertido: true },
        { ...cambio("parada", paradaExclusiva, "ACTIVA", "CERRADA"), revertido: true },
        { ...cambio("estacion", estacionExclusiva, "ACTIVA", "CERRADA"), revertido: true },
        { ...cambio("municipalidad", muni, "INACTIVA", "ACTIVA"), revertido: false },
        ...restaurados.map((c) => ({ ...c, revertido: false })),
      ]);
      expect(await storedCambios(idDesactivacion)).toEqual(res.body.cambios);
      const [stored] = await rows<{ tipo: string }>(`SELECT tipo_afectacion AS tipo FROM tbl_afectacion WHERE id_afectacion = $1`, [
        idDesactivacion,
      ]);
      expect(stored!.tipo).toBe("ACTIVAR");
      expect(await auditSince(mark)).toEqual([
        {
          accion: "activate",
          entidad_tipo: "municipalidad",
          entidad_id: muni,
          detalle: {
            idAfectacion: idDesactivacion,
            motivo: "Cierre municipal",
            fechaInicio: "2026-10-21",
            fechaFin: null,
            estadoAnterior: "INACTIVA",
            estadoNuevo: "ACTIVA",
            cascada: restaurados,
          },
        },
        {
          accion: "update",
          entidad_tipo: "afectacion",
          entidad_id: idDesactivacion,
          detalle: { changedFields: ["accion"] },
        },
      ]);
    });

    it("editing it back to DESACTIVAR applies a fresh cascade", async () => {
      await patch(idDesactivacion, { accion: "DESACTIVAR" }).expect(200);

      expect(await estados()).toEqual(desactivados);
      const vigentes = (await storedCambios(idDesactivacion)).filter((c) => !c.revertido);
      expect(vigentes).toEqual([
        cambio("municipalidad", muni, "ACTIVA", "INACTIVA"),
        cambio("linea", linea, "ACTIVA", "INACTIVA"),
        cambio("parada", paradaExclusiva, "ACTIVA", "CERRADA"),
        cambio("estacion", estacionExclusiva, "ACTIVA", "CERRADA"),
      ].map((c) => ({ ...c, revertido: false })));
    });

    it("a new ACTIVAR restores the last DESACTIVAR's cascade, skipping rows changed since (S8)", async () => {
      // The exclusive parada was put in MANTENIMIENTO by hand after the cascade.
      await rows(`UPDATE tbl_parada SET estado_parada = 'MANTENIMIENTO' WHERE id_parada = $1`, [paradaExclusiva]);

      const res = await post({ accion: "ACTIVAR", motivo: "Reapertura", fechaInicio: "2026-10-22", idMunicipalidad: muni }).expect(201);

      expect(await estados()).toEqual({ ...activos, paradaExclusiva: "MANTENIMIENTO" });
      expect(res.body.cambios.map((c: { entidadTipo: string }) => c.entidadTipo)).toEqual(["municipalidad", "linea", "estacion"]);
      expect((await storedCambios(idDesactivacion)).every((c) => c.revertido)).toBe(true);
      await rows(`UPDATE tbl_parada SET estado_parada = 'ACTIVA' WHERE id_parada = $1`, [paradaExclusiva]);
    });

    it("only the latest afectación of the target may change acción; motivo is always editable", async () => {
      const before = await snapshot();

      const res = await patch(idDesactivacion, { accion: "ACTIVAR", motivo: "No" }).expect(409);

      expect(res.body.message).toBe("Solo la afectación más reciente de este objetivo puede cambiar de acción");
      expect(res.body.error).toBe("AFECTACION_NO_ES_ULTIMA");
      expect(await snapshot()).toBe(before);

      const mark = await auditMark();
      const ok = await patch(idDesactivacion, { motivo: "Cierre municipal corregido" }).expect(200);
      expect(ok.body.motivo).toBe("Cierre municipal corregido");
      expect(await auditSince(mark)).toEqual([
        { accion: "update", entidad_tipo: "afectacion", entidad_id: idDesactivacion, detalle: { changedFields: ["motivo"] } },
      ]);
    });

    it("a changed acción that is a no-op on the target is 409 AFECTACION_SIN_CAMBIO and changes nothing", async () => {
      const [latest] = await rows<{ id: string }>(
        `SELECT MAX(id_afectacion)::text AS id FROM tbl_afectacion WHERE id_municipalidad = $1`,
        [muni],
      );
      // The municipalidad was deactivated outside afectaciones.
      await rows(`UPDATE tbl_municipalidad SET estado_municipalidad = 'INACTIVA' WHERE id_municipalidad = $1`, [muni]);
      const before = await snapshot();

      const res = await patch(latest!.id, { accion: "DESACTIVAR" }).expect(409);

      expect(res.body.message).toBe("La municipalidad ya está inactiva");
      expect(res.body.error).toBe("AFECTACION_SIN_CAMBIO");
      expect(await snapshot()).toBe(before);
      await rows(`UPDATE tbl_municipalidad SET estado_municipalidad = 'ACTIVA' WHERE id_municipalidad = $1`, [muni]);
    });

    it("PATCH ignores target fields (whitelist strips them)", async () => {
      const res = await patch(idDesactivacion, {
        idMunicipalidad: otraMuni,
        idLinea: lineaOtra,
        idParada: paradaCompartida,
        idEstacion: estacionExclusiva,
        motivo: "Solo motivo",
      }).expect(200);

      expect(res.body).toMatchObject({
        idMunicipalidad: muni,
        idLinea: null,
        idParada: null,
        idEstacion: null,
        motivo: "Solo motivo",
      });
      const [stored] = await rows<Record<string, unknown>>(
        `SELECT id_municipalidad::text AS m, id_linea, id_parada, id_estacion FROM tbl_afectacion WHERE id_afectacion = $1`,
        [idDesactivacion],
      );
      expect(stored).toEqual({ m: muni, id_linea: null, id_parada: null, id_estacion: null });
    });
  });

  describe("Municipalidades delete and estado edit go through the engine (S6/S9)", () => {
    let muni: string;
    let linea: string;
    let parada: string;

    beforeAll(async () => {
      muni = await insertMunicipalidad("San Miguel");
      linea = await insertLinea("San Miguel 1", "ACTIVA", [muni]);
      parada = await insertParada("SM exclusiva", "ACTIVA", [linea]);
    });

    function muniRequest(method: "delete" | "patch") {
      return request(app.getHttpServer())
        [method](`/infrastructure/municipalidades/${muni}`)
        .set("Authorization", `Bearer ${token}`);
    }

    it("DELETE deactivates it with cascade, through an afectación, keeping the remove row", async () => {
      const mark = await auditMark();

      await muniRequest("delete").expect(200);

      expect(await estado("municipalidad", muni)).toBe("INACTIVA");
      expect(await estado("linea", linea)).toBe("INACTIVA");
      expect(await estado("parada", parada)).toBe("CERRADA");
      const stored = await rows<Record<string, unknown>>(
        `SELECT tipo_afectacion, motivo, to_char(fecha_inicio, 'YYYY-MM-DD') AS fecha FROM tbl_afectacion WHERE id_municipalidad = $1`,
        [muni],
      );
      expect(stored).toEqual([{ tipo_afectacion: "DESACTIVAR", motivo: "Desactivada desde Municipalidades", fecha: today() }]);
      const audit = await auditSince(mark);
      expect(audit.map((a) => `${a.accion} ${a.entidad_tipo}`)).toEqual(["deactivate municipalidad", "remove municipalidad"]);
      expect((audit[0]!.detalle as { cascada: unknown[] }).cascada).toEqual([
        cambio("linea", linea, "ACTIVA", "INACTIVA"),
        cambio("parada", parada, "ACTIVA", "CERRADA"),
      ]);
    });

    it("DELETE of an already INACTIVA municipalidad creates no afectación", async () => {
      const [before] = await rows<{ n: number }>(`SELECT COUNT(*)::int AS n FROM tbl_afectacion WHERE id_municipalidad = $1`, [muni]);

      await muniRequest("delete").expect(200);

      const [after] = await rows<{ n: number }>(`SELECT COUNT(*)::int AS n FROM tbl_afectacion WHERE id_municipalidad = $1`, [muni]);
      expect(after!.n).toBe(before!.n);
    });

    it("PATCH estado ACTIVA reactivates it and restores the cascade", async () => {
      const mark = await auditMark();

      const res = await muniRequest("patch").send({ estadoMunicipalidad: "ACTIVA" }).expect(200);

      expect(res.body.estadoMunicipalidad).toBe("ACTIVA");
      expect(await estado("linea", linea)).toBe("ACTIVA");
      expect(await estado("parada", parada)).toBe("ACTIVA");
      const [latest] = await rows<Record<string, unknown>>(
        `SELECT tipo_afectacion, motivo FROM tbl_afectacion WHERE id_municipalidad = $1 ORDER BY id_afectacion DESC LIMIT 1`,
        [muni],
      );
      expect(latest).toEqual({ tipo_afectacion: "ACTIVAR", motivo: "Activada desde Municipalidades" });
      const audit = await auditSince(mark);
      expect(audit.map((a) => `${a.accion} ${a.entidad_tipo}`)).toEqual(["activate municipalidad", "update municipalidad"]);
      expect(audit[1]!.detalle).toEqual({ changedFields: ["estadoMunicipalidad"] });
    });

    it("PATCH estado INACTIVA deactivates it with cascade", async () => {
      await muniRequest("patch").send({ estadoMunicipalidad: "INACTIVA" }).expect(200);

      expect(await estado("municipalidad", muni)).toBe("INACTIVA");
      expect(await estado("linea", linea)).toBe("INACTIVA");
      expect(await estado("parada", parada)).toBe("CERRADA");
    });
  });

  // A cascade's change stops counting once anything else changes that row, so
  // a later ACTIVAR of the municipalidad never undoes a newer direct change.
  describe("superseded cascade changes (S8)", () => {
    async function cambiosDeEntidad(tipo: Tipo, id: string, ids: string[]) {
      return rows<Record<string, unknown>>(
        `SELECT estado_anterior AS "estadoAnterior", estado_nuevo AS "estadoNuevo" FROM tbl_afectacion_cambio
          WHERE entidad_tipo = $1 AND entidad_id = $2 AND id_afectacion = ANY($3::bigint[])`,
        [tipo, id, ids],
      );
    }

    it("parada closed directly after being reopened is not reopened by the municipalidad ACTIVAR", async () => {
      const muni = await insertMunicipalidad("Supersede parada");
      const linea = await insertLinea("Supersede parada 1", "ACTIVA", [muni]);
      const parada = await insertParada("Supersede parada P", "ACTIVA", [linea]);
      const base = { motivo: "S8", fechaInicio: "2026-10-21" };

      await post({ ...base, accion: "DESACTIVAR", idMunicipalidad: muni }).expect(201);
      expect(await estado("parada", parada)).toBe("CERRADA");
      await post({ ...base, accion: "ACTIVAR", idParada: parada }).expect(201);
      await post({ ...base, accion: "DESACTIVAR", idParada: parada }).expect(201);
      const res = await post({ ...base, accion: "ACTIVAR", idMunicipalidad: muni }).expect(201);

      expect(await estado("municipalidad", muni)).toBe("ACTIVA");
      expect(await estado("linea", linea)).toBe("ACTIVA");
      expect(await estado("parada", parada)).toBe("CERRADA");
      expect(res.body.cambios.map((c: { entidadTipo: string }) => c.entidadTipo)).toEqual(["municipalidad", "linea"]);
    });

    it("línea deactivated directly after being reactivated stays INACTIVA", async () => {
      const muni = await insertMunicipalidad("Supersede línea");
      const linea = await insertLinea("Supersede línea 1", "ACTIVA", [muni]);
      const base = { motivo: "S8", fechaInicio: "2026-10-21" };

      await post({ ...base, accion: "DESACTIVAR", idMunicipalidad: muni }).expect(201);
      await post({ ...base, accion: "ACTIVAR", idLinea: linea }).expect(201);
      await post({ ...base, accion: "DESACTIVAR", idLinea: linea }).expect(201);
      const res = await post({ ...base, accion: "ACTIVAR", idMunicipalidad: muni }).expect(201);

      expect(await estado("municipalidad", muni)).toBe("ACTIVA");
      expect(await estado("linea", linea)).toBe("INACTIVA");
      expect(res.body.cambios.map((c: { entidadTipo: string }) => c.entidadTipo)).toEqual(["municipalidad"]);
    });

    it("municipalidad PATCH estado + duplicate name is 409 and changes nothing", async () => {
      const taken = await insertMunicipalidad("Nombre tomado");
      const muni = await insertMunicipalidad("Renombrada");
      await insertLinea("Renombrada 1", "ACTIVA", [muni]);
      const [nombre] = await rows<{ n: string }>(
        `SELECT nombre_municipalidad AS n FROM tbl_municipalidad WHERE id_municipalidad = $1`,
        [taken],
      );
      const before = await snapshot();

      const res = await request(app.getHttpServer())
        .patch(`/infrastructure/municipalidades/${muni}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ nombreMunicipalidad: nombre!.n, estadoMunicipalidad: "INACTIVA" })
        .expect(409);

      expect(res.body.error).toBe("MUNICIPALIDAD_NOMBRE_DUPLICATE");
      expect(await snapshot()).toBe(before);
    });

    it("concurrent DESACTIVAR of municipalidades sharing a línea takes it down exactly once", async () => {
      const muniA = await insertMunicipalidad("Concurrente A");
      const muniB = await insertMunicipalidad("Concurrente B");
      const linea = await insertLinea("Concurrente compartida", "ACTIVA", [muniA, muniB]);
      const base = { accion: "DESACTIVAR", motivo: "S6 concurrente", fechaInicio: "2026-10-21" };

      const [a, b] = await Promise.all([
        post({ ...base, idMunicipalidad: muniA }),
        post({ ...base, idMunicipalidad: muniB }),
      ]);

      expect([a.status, b.status]).toEqual([201, 201]);
      expect(await estado("municipalidad", muniA)).toBe("INACTIVA");
      expect(await estado("municipalidad", muniB)).toBe("INACTIVA");
      expect(await estado("linea", linea)).toBe("INACTIVA");
      const ids = [String(a.body.idAfectacion), String(b.body.idAfectacion)];
      expect(await cambiosDeEntidad("linea", linea, ids)).toEqual([{ estadoAnterior: "ACTIVA", estadoNuevo: "INACTIVA" }]);
    });

    it("concurrent DELETE of the same municipalidad: both 200, one afectación", async () => {
      const muni = await insertMunicipalidad("Borrado doble");
      const linea = await insertLinea("Borrado doble 1", "ACTIVA", [muni]);
      const mark = await auditMark();
      const del = () =>
        request(app.getHttpServer())
          .delete(`/infrastructure/municipalidades/${muni}`)
          .set("Authorization", `Bearer ${token}`);

      const [a, b] = await Promise.all([del(), del()]);

      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await estado("municipalidad", muni)).toBe("INACTIVA");
      expect(await estado("linea", linea)).toBe("INACTIVA");
      const [count] = await rows<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM tbl_afectacion WHERE id_municipalidad = $1`,
        [muni],
      );
      expect(count!.n).toBe(1);
      const audit = await auditSince(mark);
      expect(audit.map((r) => `${r.accion} ${r.entidad_tipo}`)).toEqual([
        "deactivate municipalidad",
        "remove municipalidad",
        "remove municipalidad",
      ]);
    });

    it("PATCH fechaFin null clears the stored fecha fin", async () => {
      const linea = await insertLinea("Fecha fin nula");
      const creada = await post({
        accion: "DESACTIVAR",
        motivo: "Con fin",
        fechaInicio: "2026-10-21",
        fechaFin: "2026-10-30",
        idLinea: linea,
      }).expect(201);
      const id = String(creada.body.idAfectacion);

      const res = await patch(id, { fechaFin: null }).expect(200);

      expect(res.body.fechaFin).toBeNull();
      const [stored] = await rows<{ fin: string | null }>(
        `SELECT fecha_fin AS fin FROM tbl_afectacion WHERE id_afectacion = $1`,
        [id],
      );
      expect(stored!.fin).toBeNull();
    });
  });

  describe("línea cascade (S7)", () => {
    it("closes paradas no other ACTIVA línea owns, through tbl_linea_parada or tbl_estacion_linea", async () => {
      const linea = await insertLinea("S7 objetivo");
      const lineaInactiva = await insertLinea("S7 inactiva", "INACTIVA");
      const lineaActiva = await insertLinea("S7 activa");
      const paradaViaEstacion = await insertParada("S7 vía estación");
      const estacion = await insertEstacion("S7 estación", paradaViaEstacion, "ACTIVA", [linea]);
      const paradaConInactiva = await insertParada("S7 con inactiva", "ACTIVA", [linea, lineaInactiva]);
      const paradaConActiva = await insertParada("S7 con activa", "ACTIVA", [linea]);
      await insertEstacion("S7 estación compartida", paradaConActiva, "ACTIVA", [lineaActiva]);

      const res = await post({ accion: "DESACTIVAR", motivo: "S7", fechaInicio: "2026-10-21", idLinea: linea }).expect(201);

      expect(await estado("linea", linea)).toBe("INACTIVA");
      expect(await estado("parada", paradaViaEstacion)).toBe("CERRADA");
      expect(await estado("estacion", estacion)).toBe("CERRADA");
      expect(await estado("parada", paradaConInactiva)).toBe("CERRADA");
      expect(await estado("parada", paradaConActiva)).toBe("ACTIVA");
      expect(res.body.cambios.map((c: { entidadTipo: string; entidadId: string }) => `${c.entidadTipo}:${c.entidadId}`)).toEqual([
        `linea:${linea}`,
        ...[paradaViaEstacion, paradaConInactiva].sort((a, b) => Number(a) - Number(b)).map((p) => `parada:${p}`),
        `estacion:${estacion}`,
      ]);
    });
  });
});
