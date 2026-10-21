import { In, type EntityManager } from "typeorm";
import { AfectacionEntity } from "./afectacion.entity.js";
import { AfectacionCambioEntity } from "./afectacion-cambio.entity.js";

/** Kinds of rows an afectación can change. Values match the bitácora entidad_tipo. */
export type EntidadTipo = "municipalidad" | "linea" | "parada" | "estacion";

export interface EntidadRef {
  tipo: EntidadTipo;
  id: string;
}

/** One state change made by an afectación (a tbl_afectacion_cambio row). */
export interface CambioEstado {
  entidadTipo: EntidadTipo;
  entidadId: string;
  estadoAnterior: string;
  estadoNuevo: string;
}

export interface CambioRegistrado extends CambioEstado {
  idCambio: string;
  /** true once the change is no longer in effect (reverted or superseded). */
  revertido: boolean;
}

/** tbl_afectacion row with its dates as YYYY-MM-DD, for comparisons. */
export interface AfectacionRegistro {
  idAfectacion: string;
  tipoAfectacion: string;
  motivo: string;
  fechaInicio: string;
  fechaFin: string | null;
  idMunicipalidad: string | null;
  idLinea: string | null;
  idParada: string | null;
  idEstacion: string | null;
}

export type NuevaAfectacion = Omit<AfectacionRegistro, "idAfectacion">;

/** Línea ↔ parada ownership, through tbl_linea_parada or tbl_estacion_linea. */
export interface VinculoLineaParada {
  idLinea: string;
  idParada: string;
}

/**
 * Persistence used by the afectación engine, bound to one transaction.
 * Reads of the línea/parada graph take no locks; bloquearEstados locks rows
 * FOR UPDATE in a deterministic order (kind rank, then numeric id).
 */
export interface AfectacionStore {
  lineasDeMunicipalidad(idMunicipalidad: string): Promise<string[]>;
  municipalidadesDeLineas(idLineas: string[]): Promise<Array<{ idLinea: string; idMunicipalidad: string }>>;
  vinculosDeLineas(idLineas: string[]): Promise<VinculoLineaParada[]>;
  vinculosDeParadas(idParadas: string[]): Promise<VinculoLineaParada[]>;
  estacionesDeParadas(idParadas: string[]): Promise<Array<{ idParada: string; idEstacion: string }>>;
  /** Locks the rows and returns their state by refKey; missing rows are absent. */
  bloquearEstados(refs: EntidadRef[]): Promise<Map<string, string>>;
  guardarEstado(ref: EntidadRef, estado: string): Promise<void>;

  bloquearAfectacion(idAfectacion: string): Promise<AfectacionRegistro | null>;
  /** Highest idAfectacion that targets `target`. */
  ultimaAfectacion(target: EntidadRef): Promise<string | null>;
  /** Highest DESACTIVAR afectación of `target` whose change on the target is still in effect. */
  ultimaDesactivacionVigente(target: EntidadRef): Promise<string | null>;
  cambiosVigentes(idAfectacion: string): Promise<CambioRegistrado[]>;
  insertarAfectacion(datos: NuevaAfectacion): Promise<string>;
  actualizarAfectacion(
    idAfectacion: string,
    datos: Pick<AfectacionRegistro, "tipoAfectacion" | "motivo" | "fechaInicio" | "fechaFin">
  ): Promise<void>;
  insertarCambios(idAfectacion: string, cambios: CambioEstado[]): Promise<void>;
  marcarRevertidos(idCambios: string[]): Promise<void>;
  /** Every change of the given afectaciones, oldest first, by idAfectacion. */
  cambiosDe(idAfectaciones: string[]): Promise<Map<string, CambioRegistrado[]>>;
}

export type AfectacionStoreFactory = (manager: EntityManager) => AfectacionStore;
export const AFECTACION_STORE_FACTORY = Symbol("AFECTACION_STORE_FACTORY");

export const ENTIDAD_RANK: Record<EntidadTipo, number> = {
  municipalidad: 0,
  linea: 1,
  parada: 2,
  estacion: 3,
};

export function refKey(ref: EntidadRef): string {
  return `${ref.tipo}:${ref.id}`;
}

/** Deterministic lock order: kind rank, then numeric id. Removes duplicates. */
export function ordenarRefs(refs: EntidadRef[]): EntidadRef[] {
  const unique = new Map(refs.map((ref) => [refKey(ref), ref]));
  return [...unique.values()].sort((a, b) => {
    const byRank = ENTIDAD_RANK[a.tipo] - ENTIDAD_RANK[b.tipo];
    if (byRank !== 0) return byRank;
    const [x, y] = [BigInt(a.id), BigInt(b.id)];
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

const TABLES: Record<EntidadTipo, { table: string; id: string; estado: string }> = {
  municipalidad: { table: "tbl_municipalidad", id: "id_municipalidad", estado: "estado_municipalidad" },
  linea: { table: "tbl_linea", id: "id_linea", estado: "estado_linea" },
  parada: { table: "tbl_parada", id: "id_parada", estado: "estado_parada" },
  estacion: { table: "tbl_estacion", id: "id_estacion", estado: "estado_estacion" },
};

const TARGET_COLUMNS: Record<EntidadTipo, string> = {
  municipalidad: "id_municipalidad",
  linea: "id_linea",
  parada: "id_parada",
  estacion: "id_estacion",
};

// to_char uses the session time zone, the same one Postgres used to read the
// YYYY-MM-DD the afectación was stored with.
const AFECTACION_COLUMNS = `
  id_afectacion::text AS "idAfectacion",
  tipo_afectacion AS "tipoAfectacion",
  motivo,
  to_char(fecha_inicio, 'YYYY-MM-DD') AS "fechaInicio",
  to_char(fecha_fin, 'YYYY-MM-DD') AS "fechaFin",
  id_municipalidad::text AS "idMunicipalidad",
  id_linea::text AS "idLinea",
  id_parada::text AS "idParada",
  id_estacion::text AS "idEstacion"`;

/** AfectacionStore over the transaction's EntityManager (raw SQL, real row locks). */
export class TypeOrmAfectacionStore implements AfectacionStore {
  constructor(private readonly manager: EntityManager) {}

  private async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    return (await this.manager.query(sql, params)) as T[];
  }

  async lineasDeMunicipalidad(idMunicipalidad: string): Promise<string[]> {
    const rows = await this.query<{ id: string }>(
      `SELECT id_linea::text AS id FROM tbl_linea_municipalidad WHERE id_municipalidad = $1`,
      [idMunicipalidad]
    );
    return rows.map((r) => r.id);
  }

  async municipalidadesDeLineas(idLineas: string[]) {
    if (idLineas.length === 0) return [];
    return this.query<{ idLinea: string; idMunicipalidad: string }>(
      `SELECT id_linea::text AS "idLinea", id_municipalidad::text AS "idMunicipalidad"
         FROM tbl_linea_municipalidad WHERE id_linea = ANY($1::bigint[])`,
      [idLineas]
    );
  }

  private vinculos(column: "id_linea" | "id_parada", ids: string[]): Promise<VinculoLineaParada[]> {
    const estacionColumn = column === "id_linea" ? "el.id_linea" : "e.id_parada";
    return this.query<VinculoLineaParada>(
      `SELECT id_linea::text AS "idLinea", id_parada::text AS "idParada"
         FROM tbl_linea_parada WHERE ${column} = ANY($1::bigint[])
       UNION
       SELECT el.id_linea::text, e.id_parada::text
         FROM tbl_estacion_linea el JOIN tbl_estacion e ON e.id_estacion = el.id_estacion
        WHERE ${estacionColumn} = ANY($1::bigint[])`,
      [ids]
    );
  }

  async vinculosDeLineas(idLineas: string[]) {
    return idLineas.length === 0 ? [] : this.vinculos("id_linea", idLineas);
  }

  async vinculosDeParadas(idParadas: string[]) {
    return idParadas.length === 0 ? [] : this.vinculos("id_parada", idParadas);
  }

  async estacionesDeParadas(idParadas: string[]) {
    if (idParadas.length === 0) return [];
    return this.query<{ idParada: string; idEstacion: string }>(
      `SELECT id_parada::text AS "idParada", id_estacion::text AS "idEstacion"
         FROM tbl_estacion WHERE id_parada = ANY($1::bigint[])`,
      [idParadas]
    );
  }

  async bloquearEstados(refs: EntidadRef[]): Promise<Map<string, string>> {
    const estados = new Map<string, string>();
    const ordered = ordenarRefs(refs);
    for (const tipo of Object.keys(ENTIDAD_RANK) as EntidadTipo[]) {
      const ids = ordered.filter((ref) => ref.tipo === tipo).map((ref) => ref.id);
      if (ids.length === 0) continue;
      const { table, id, estado } = TABLES[tipo];
      // ORDER BY makes Postgres lock the rows in id order.
      const rows = await this.query<{ id: string; estado: string }>(
        `SELECT ${id}::text AS id, ${estado} AS estado FROM ${table}
          WHERE ${id} = ANY($1::bigint[]) ORDER BY ${id} FOR UPDATE`,
        [ids]
      );
      for (const row of rows) estados.set(refKey({ tipo, id: row.id }), row.estado);
    }
    return estados;
  }

  async guardarEstado(ref: EntidadRef, estado: string): Promise<void> {
    const { table, id, estado: column } = TABLES[ref.tipo];
    await this.query(`UPDATE ${table} SET ${column} = $1 WHERE ${id} = $2`, [estado, ref.id]);
  }

  async bloquearAfectacion(idAfectacion: string): Promise<AfectacionRegistro | null> {
    const [row] = await this.query<AfectacionRegistro>(
      `SELECT ${AFECTACION_COLUMNS} FROM tbl_afectacion WHERE id_afectacion = $1 FOR UPDATE`,
      [idAfectacion]
    );
    return row ?? null;
  }

  async ultimaAfectacion(target: EntidadRef): Promise<string | null> {
    const [row] = await this.query<{ id: string | null }>(
      `SELECT MAX(id_afectacion)::text AS id FROM tbl_afectacion WHERE ${TARGET_COLUMNS[target.tipo]} = $1`,
      [target.id]
    );
    return row?.id ?? null;
  }

  async ultimaDesactivacionVigente(target: EntidadRef): Promise<string | null> {
    const [row] = await this.query<{ id: string }>(
      `SELECT a.id_afectacion::text AS id FROM tbl_afectacion a
        WHERE a.${TARGET_COLUMNS[target.tipo]} = $1 AND a.tipo_afectacion = 'DESACTIVAR'
          AND EXISTS (SELECT 1 FROM tbl_afectacion_cambio c
                       WHERE c.id_afectacion = a.id_afectacion AND NOT c.revertido
                         AND c.entidad_tipo = $2 AND c.entidad_id = $1)
        ORDER BY a.id_afectacion DESC LIMIT 1`,
      [target.id, target.tipo]
    );
    return row?.id ?? null;
  }

  async cambiosVigentes(idAfectacion: string): Promise<CambioRegistrado[]> {
    const cambios = (await this.cambiosDe([idAfectacion])).get(idAfectacion) ?? [];
    return cambios.filter((c) => !c.revertido);
  }

  async insertarAfectacion(datos: NuevaAfectacion): Promise<string> {
    const repo = this.manager.getRepository(AfectacionEntity);
    const saved = await repo.save(
      repo.create({ ...datos, estadoAfectacion: "APLICADA" })
    );
    return String(saved.idAfectacion);
  }

  async actualizarAfectacion(
    idAfectacion: string,
    datos: Pick<AfectacionRegistro, "tipoAfectacion" | "motivo" | "fechaInicio" | "fechaFin">
  ): Promise<void> {
    await this.manager.getRepository(AfectacionEntity).update({ idAfectacion }, datos);
  }

  async insertarCambios(idAfectacion: string, cambios: CambioEstado[]): Promise<void> {
    if (cambios.length === 0) return;
    const repo = this.manager.getRepository(AfectacionCambioEntity);
    await repo.insert(cambios.map((c) => ({ ...c, idAfectacion, revertido: false })));
  }

  async marcarRevertidos(idCambios: string[]): Promise<void> {
    if (idCambios.length === 0) return;
    await this.query(
      `UPDATE tbl_afectacion_cambio SET revertido = true WHERE id_afectacion_cambio = ANY($1::bigint[])`,
      [idCambios]
    );
  }

  async cambiosDe(idAfectaciones: string[]): Promise<Map<string, CambioRegistrado[]>> {
    const byAfectacion = new Map<string, CambioRegistrado[]>();
    if (idAfectaciones.length === 0) return byAfectacion;
    const rows = await this.manager.getRepository(AfectacionCambioEntity).find({
      where: { idAfectacion: In(idAfectaciones) },
      order: { idCambio: "ASC" },
    });
    for (const row of rows) {
      const list = byAfectacion.get(row.idAfectacion) ?? [];
      list.push({
        idCambio: row.idCambio,
        entidadTipo: row.entidadTipo as EntidadTipo,
        entidadId: row.entidadId,
        estadoAnterior: row.estadoAnterior,
        estadoNuevo: row.estadoNuevo,
        revertido: row.revertido,
      });
      byAfectacion.set(row.idAfectacion, list);
    }
    return byAfectacion;
  }
}
