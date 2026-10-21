import {
  ordenarRefs,
  refKey,
  type AfectacionStore,
  type CambioEstado,
  type CambioRegistrado,
  type EntidadRef,
  type EntidadTipo,
} from "./afectacion.store.js";

interface EntidadKind {
  /** "Línea con ID 9 no encontrada" */
  label: string;
  /** "La línea ya está activa" */
  article: string;
  activo: string;
  inactivo: string;
}

export const ENTIDAD_KINDS: Record<EntidadTipo, EntidadKind> = {
  municipalidad: { label: "Municipalidad", article: "La municipalidad", activo: "ACTIVA", inactivo: "INACTIVA" },
  linea: { label: "Línea", article: "La línea", activo: "ACTIVA", inactivo: "INACTIVA" },
  parada: { label: "Parada", article: "La parada", activo: "ACTIVA", inactivo: "CERRADA" },
  estacion: { label: "Estación", article: "La estación", activo: "ACTIVA", inactivo: "CERRADA" },
};

/**
 * The state changes an action would make, computed with every affected row
 * already locked. Nothing is written until `aplicar`, so a caller can still
 * reject the request after planning.
 */
export interface PlanCambios {
  /** The target's current state; null when the target does not exist. */
  estadoActual: string | null;
  /** Target first, then cascaded rows in lock order. Empty = no-op. */
  cambios: CambioEstado[];
}

const toCambio = (ref: EntidadRef, estadoAnterior: string, estadoNuevo: string): CambioEstado => ({
  entidadTipo: ref.tipo,
  entidadId: ref.id,
  estadoAnterior,
  estadoNuevo,
});

/**
 * Activates and deactivates municipalidades, líneas, paradas and estaciones.
 *
 * DESACTIVAR cascades (S6/S7): a municipalidad takes down its líneas that no
 * other ACTIVA municipalidad has, and every línea going down closes the
 * paradas (and their estaciones) that no other ACTIVA línea owns, through
 * tbl_linea_parada or tbl_estacion_linea. Exclusivity is decided after the
 * whole set of líneas going down is known, so a parada shared only among them
 * closes too. Paradas and estaciones targeted directly do not cascade.
 *
 * ACTIVAR (S8/S10) sets the target ACTIVA and restores the given changes,
 * each one only if its row is still in the state that change set.
 */
export class AfectacionEngine {
  constructor(private readonly store: AfectacionStore) {}

  async planDesactivar(target: EntidadRef): Promise<PlanCambios> {
    // Discover the affected rows without locks, lock them all in one ordered
    // pass, then recompute under the locks (links may have changed meanwhile).
    const discovered = (await this.grafo(target)).refs;
    const estados = await this.store.bloquearEstados(discovered);
    let grafo = await this.grafo(target);
    const lockedKeys = new Set(discovered.map(refKey));
    const extra = grafo.refs.filter((ref) => !lockedKeys.has(refKey(ref)));
    if (extra.length > 0) {
      for (const [key, estado] of await this.store.bloquearEstados(extra)) estados.set(key, estado);
      grafo = await this.grafo(target);
    }

    const estadoActual = estados.get(refKey(target)) ?? null;
    const kind = ENTIDAD_KINDS[target.tipo];
    if (estadoActual === null || estadoActual === kind.inactivo) {
      return { estadoActual, cambios: [] };
    }

    const estado = (ref: EntidadRef) => estados.get(refKey(ref));
    const lineasCaen = new Set<string>();
    if (target.tipo === "linea") lineasCaen.add(target.id);
    if (target.tipo === "municipalidad") {
      for (const idLinea of grafo.lineasDeMunicipalidad) {
        if (estado({ tipo: "linea", id: idLinea }) !== ENTIDAD_KINDS.linea.activo) continue;
        const compartida = grafo.municipalidades.some(
          (v) =>
            v.idLinea === idLinea &&
            v.idMunicipalidad !== target.id &&
            estado({ tipo: "municipalidad", id: v.idMunicipalidad }) === ENTIDAD_KINDS.municipalidad.activo
        );
        if (!compartida) lineasCaen.add(idLinea);
      }
    }

    const cascada: EntidadRef[] = [...lineasCaen]
      .filter((id) => !(target.tipo === "linea" && id === target.id))
      .map((id) => ({ tipo: "linea", id }));
    const paradas = new Set(grafo.vinculos.filter((v) => lineasCaen.has(v.idLinea)).map((v) => v.idParada));
    for (const idParada of paradas) {
      const compartida = grafo.vinculos.some(
        (v) =>
          v.idParada === idParada &&
          !lineasCaen.has(v.idLinea) &&
          estado({ tipo: "linea", id: v.idLinea }) === ENTIDAD_KINDS.linea.activo
      );
      if (compartida) continue;
      cascada.push({ tipo: "parada", id: idParada });
      const estacion = grafo.estaciones.find((e) => e.idParada === idParada);
      if (estacion) cascada.push({ tipo: "estacion", id: estacion.idEstacion });
    }

    const cambios = [toCambio(target, estadoActual, kind.inactivo)];
    for (const ref of ordenarRefs(cascada)) {
      const actual = estado(ref);
      const inactivo = ENTIDAD_KINDS[ref.tipo].inactivo;
      if (actual !== undefined && actual !== inactivo) cambios.push(toCambio(ref, actual, inactivo));
    }
    return { estadoActual, cambios };
  }

  /**
   * Locks the target first, then calls `restaurar` for the changes to undo
   * (so they are read under the target's lock) and locks their rows. Restored rows always
   * rank after their target (municipalidad < línea < parada < estación), so
   * this keeps the global lock order.
   */
  async planActivar(
    target: EntidadRef,
    restaurar: () => Promise<CambioRegistrado[]>
  ): Promise<PlanCambios> {
    const estados = await this.store.bloquearEstados([target]);
    const estadoActual = estados.get(refKey(target)) ?? null;
    const kind = ENTIDAD_KINDS[target.tipo];
    if (estadoActual === null || estadoActual === kind.activo) {
      return { estadoActual, cambios: [] };
    }

    const otros = (await restaurar()).filter((c) => !(c.entidadTipo === target.tipo && c.entidadId === target.id));
    const refs = ordenarRefs(otros.map((c) => ({ tipo: c.entidadTipo, id: c.entidadId })));
    const locked = refs.length > 0 ? await this.store.bloquearEstados(refs) : new Map<string, string>();

    const cambios = [toCambio(target, estadoActual, kind.activo)];
    for (const ref of refs) {
      const previo = otros.find((c) => c.entidadTipo === ref.tipo && c.entidadId === ref.id)!;
      const actual = locked.get(refKey(ref));
      if (actual === previo.estadoNuevo) cambios.push(toCambio(ref, actual, previo.estadoAnterior));
    }
    return { estadoActual, cambios };
  }

  async aplicar(plan: PlanCambios): Promise<void> {
    for (const c of plan.cambios) {
      await this.store.guardarEstado({ tipo: c.entidadTipo, id: c.entidadId }, c.estadoNuevo);
    }
  }

  /** Every row whose state decides the cascade of deactivating `target`. */
  private async grafo(target: EntidadRef) {
    const lineasDeMunicipalidad =
      target.tipo === "municipalidad" ? await this.store.lineasDeMunicipalidad(target.id) : [];
    const municipalidades = await this.store.municipalidadesDeLineas(lineasDeMunicipalidad);
    const lineas = target.tipo === "linea" ? [target.id] : target.tipo === "municipalidad" ? lineasDeMunicipalidad : [];
    const paradas = [...new Set((await this.store.vinculosDeLineas(lineas)).map((v) => v.idParada))];
    const vinculos = await this.store.vinculosDeParadas(paradas);
    const estaciones = await this.store.estacionesDeParadas(paradas);

    const refs: EntidadRef[] = [
      target,
      ...municipalidades.map((v) => ({ tipo: "municipalidad" as const, id: v.idMunicipalidad })),
      ...lineas.map((id) => ({ tipo: "linea" as const, id })),
      ...vinculos.map((v) => ({ tipo: "linea" as const, id: v.idLinea })),
      ...paradas.map((id) => ({ tipo: "parada" as const, id })),
      ...estaciones.map((e) => ({ tipo: "estacion" as const, id: e.idEstacion })),
    ];
    return { lineasDeMunicipalidad, municipalidades, vinculos, estaciones, refs: ordenarRefs(refs) };
  }
}
