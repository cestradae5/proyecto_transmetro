// AfectacionService unit tests over an in-memory AfectacionStore.
// An afectación activates or deactivates one municipalidad, línea, parada or
// estación. Deactivating a municipalidad cascades to its exclusive líneas, and
// a línea to its exclusive paradas/estaciones (S6/S7); ACTIVAR restores what
// the last DESACTIVAR cascaded off (S8); an afectación can be edited (S10).
// Every check runs before the first write, so rejected requests write nothing.

import { jest } from "@jest/globals";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import type { EntityManager, Repository } from "typeorm";

import type { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import { INFRASTRUCTURE_AUDIT_ACTIONS } from "../shared/infrastructure-audit.constants.js";
import { AccionAfectacion, type AfectacionEntity } from "./afectacion.entity.js";
import { AfectacionService } from "./afectacion.service.js";
import type { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import {
  ordenarRefs,
  refKey,
  type AfectacionRegistro,
  type AfectacionStore,
  type CambioEstado,
  type CambioRegistrado,
  type EntidadRef,
  type EntidadTipo,
  type NuevaAfectacion,
} from "./afectacion.store.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

const ACTOR = "7";

/** In-memory graph + afectaciones. Records every lock call and every write. */
class FakeStore implements AfectacionStore {
  estados = new Map<string, string>();
  lineaMunicipalidad: Array<[string, string]> = [];
  lineaParada: Array<[string, string]> = [];
  estacionLinea: Array<[string, string]> = [];
  estacionDeParada = new Map<string, string>();
  afectaciones = new Map<string, AfectacionRegistro>();
  cambios: Array<CambioRegistrado & { idAfectacion: string }> = [];
  lockCalls: string[][] = [];
  writes: string[] = [];
  private nextAfectacion = 100;
  private nextCambio = 1;

  set(tipo: EntidadTipo, id: string, estado: string): this {
    this.estados.set(refKey({ tipo, id }), estado);
    return this;
  }
  estado(tipo: EntidadTipo, id: string): string | undefined {
    return this.estados.get(refKey({ tipo, id }));
  }
  estacion(idEstacion: string, idParada: string, estado = "ACTIVA"): this {
    this.estacionDeParada.set(idParada, idEstacion);
    return this.set("estacion", idEstacion, estado);
  }
  seedAfectacion(registro: Partial<AfectacionRegistro> & { idAfectacion: string }, cambios: CambioEstado[] = []) {
    this.afectaciones.set(registro.idAfectacion, {
      tipoAfectacion: "DESACTIVAR",
      motivo: "Previa",
      fechaInicio: "2026-10-01",
      fechaFin: null,
      idMunicipalidad: null,
      idLinea: null,
      idParada: null,
      idEstacion: null,
      ...registro,
    });
    for (const c of cambios) {
      this.cambios.push({ ...c, idAfectacion: registro.idAfectacion, idCambio: String(this.nextCambio++), revertido: false });
    }
  }

  async lineasDeMunicipalidad(m: string) {
    return this.lineaMunicipalidad.filter(([, mm]) => mm === m).map(([l]) => l);
  }
  async municipalidadesDeLineas(ls: string[]) {
    return this.lineaMunicipalidad
      .filter(([l]) => ls.includes(l))
      .map(([idLinea, idMunicipalidad]) => ({ idLinea, idMunicipalidad }));
  }
  private vinculos() {
    const viaEstacion = this.estacionLinea.map(([l, e]) => {
      const parada = [...this.estacionDeParada].find(([, ee]) => ee === e)![0];
      return { idLinea: l, idParada: parada };
    });
    return [...this.lineaParada.map(([idLinea, idParada]) => ({ idLinea, idParada })), ...viaEstacion];
  }
  async vinculosDeLineas(ls: string[]) {
    return this.vinculos().filter((v) => ls.includes(v.idLinea));
  }
  async vinculosDeParadas(ps: string[]) {
    return this.vinculos().filter((v) => ps.includes(v.idParada));
  }
  async estacionesDeParadas(ps: string[]) {
    return ps
      .filter((p) => this.estacionDeParada.has(p))
      .map((p) => ({ idParada: p, idEstacion: this.estacionDeParada.get(p)! }));
  }
  async bloquearEstados(refs: EntidadRef[]) {
    this.lockCalls.push(refs.map(refKey));
    const out = new Map<string, string>();
    for (const ref of refs) {
      const estado = this.estados.get(refKey(ref));
      if (estado !== undefined) out.set(refKey(ref), estado);
    }
    return out;
  }
  async guardarEstado(ref: EntidadRef, estado: string) {
    this.writes.push(`estado ${refKey(ref)}=${estado}`);
    this.estados.set(refKey(ref), estado);
  }
  async bloquearAfectacion(id: string) {
    const a = this.afectaciones.get(id);
    return a ? { ...a } : null;
  }
  private targetOf(a: AfectacionRegistro): EntidadRef {
    if (a.idMunicipalidad) return { tipo: "municipalidad", id: a.idMunicipalidad };
    if (a.idLinea) return { tipo: "linea", id: a.idLinea };
    if (a.idParada) return { tipo: "parada", id: a.idParada };
    return { tipo: "estacion", id: a.idEstacion! };
  }
  private sobre(target: EntidadRef) {
    return [...this.afectaciones.values()]
      .filter((a) => refKey(this.targetOf(a)) === refKey(target))
      .sort((a, b) => Number(b.idAfectacion) - Number(a.idAfectacion));
  }
  async ultimaAfectacion(target: EntidadRef) {
    return this.sobre(target)[0]?.idAfectacion ?? null;
  }
  async ultimaDesactivacionVigente(target: EntidadRef) {
    const hit = this.sobre(target).find(
      (a) =>
        a.tipoAfectacion === "DESACTIVAR" &&
        this.cambios.some(
          (c) => c.idAfectacion === a.idAfectacion && !c.revertido && c.entidadTipo === target.tipo && c.entidadId === target.id
        )
    );
    return hit?.idAfectacion ?? null;
  }
  async cambiosVigentes(id: string) {
    return this.cambios.filter((c) => c.idAfectacion === id && !c.revertido).map(({ idAfectacion: _, ...c }) => ({ ...c }));
  }
  async insertarAfectacion(datos: NuevaAfectacion) {
    const idAfectacion = String(this.nextAfectacion++);
    this.writes.push(`afectacion ${idAfectacion}`);
    this.afectaciones.set(idAfectacion, { ...datos, idAfectacion });
    return idAfectacion;
  }
  async actualizarAfectacion(id: string, datos: Partial<AfectacionRegistro>) {
    this.writes.push(`update afectacion ${id}`);
    Object.assign(this.afectaciones.get(id)!, datos);
  }
  async insertarCambios(idAfectacion: string, cambios: CambioEstado[]) {
    for (const c of cambios) {
      this.writes.push(`cambio ${idAfectacion} ${c.entidadTipo}:${c.entidadId}`);
      this.cambios.push({ ...c, idAfectacion, idCambio: String(this.nextCambio++), revertido: false });
    }
  }
  async marcarRevertidos(ids: string[]) {
    for (const c of this.cambios) {
      if (ids.includes(c.idCambio)) {
        this.writes.push(`revertido ${c.idCambio}`);
        c.revertido = true;
      }
    }
  }
  async cambiosDe(ids: string[]) {
    const out = new Map<string, CambioRegistrado[]>();
    for (const c of this.cambios.filter((c) => ids.includes(c.idAfectacion))) {
      const { idAfectacion, ...rest } = c;
      out.set(idAfectacion, [...(out.get(idAfectacion) ?? []), rest]);
    }
    return out;
  }
  cambiosDeAfectacion(id: string) {
    return this.cambios
      .filter((c) => c.idAfectacion === id)
      .map(({ entidadTipo, entidadId, estadoAnterior, estadoNuevo, revertido }) => ({
        entidadTipo,
        entidadId,
        estadoAnterior,
        estadoNuevo,
        revertido,
      }));
  }
}

function baseDto(overrides: Partial<CreateAfectacionDto> = {}): CreateAfectacionDto {
  return { accion: AccionAfectacion.DESACTIVAR, motivo: "Obra vial", fechaInicio: "2026-10-21", ...overrides };
}

const cambio = (entidadTipo: EntidadTipo, entidadId: string, estadoAnterior: string, estadoNuevo: string) => ({
  entidadTipo,
  entidadId,
  estadoAnterior,
  estadoNuevo,
});

function errorCode(error: unknown): unknown {
  return ((error as HttpException).getResponse() as { error?: string }).error;
}

describe("AfectacionService", () => {
  let store: FakeStore;
  let audit: { record: AnyMock };
  let afectacionRepo: { find: AnyMock; findOne: AnyMock; manager: { transaction: AnyMock } };
  let service: AfectacionService;

  beforeEach(() => {
    store = new FakeStore();
    audit = { record: jest.fn() };
    afectacionRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn(async (cb: (m: EntityManager) => unknown) => cb({} as EntityManager)),
      },
    };
    service = new AfectacionService(
      afectacionRepo as unknown as Repository<AfectacionEntity>,
      audit as unknown as InfrastructureAuditService,
      () => store
    );
  });

  function expectNothingWritten() {
    expect(store.writes).toEqual([]);
    expect(audit.record).not.toHaveBeenCalled();
  }

  describe("create — single targets (S1/S4/S5)", () => {
    it("deactivates a línea without paradas, stores the afectación and audits it", async () => {
      store.set("linea", "1", "ACTIVA");

      const result = await service.create(baseDto({ idLinea: "1", fechaFin: "2026-10-25" }), ACTOR);

      expect(store.estado("linea", "1")).toBe("INACTIVA");
      expect(result).toEqual({
        idAfectacion: "100",
        accion: "DESACTIVAR",
        motivo: "Obra vial",
        fechaInicio: "2026-10-21",
        fechaFin: "2026-10-25",
        idMunicipalidad: null,
        idLinea: "1",
        idParada: null,
        idEstacion: null,
        cambios: [{ ...cambio("linea", "1", "ACTIVA", "INACTIVA"), revertido: false }],
      });
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.DEACTIVATE,
        entityType: "linea",
        entityId: "1",
        detalle: {
          idAfectacion: "100",
          motivo: "Obra vial",
          fechaInicio: "2026-10-21",
          fechaFin: "2026-10-25",
          estadoAnterior: "ACTIVA",
          estadoNuevo: "INACTIVA",
          cascada: [],
        },
      });
    });

    it("deactivates a parada (CERRADA) without touching its estación", async () => {
      store.set("parada", "5", "ACTIVA").estacion("3", "5");

      const result = await service.create(baseDto({ idParada: "5" }), ACTOR);

      expect(store.estado("parada", "5")).toBe("CERRADA");
      expect(store.estado("estacion", "3")).toBe("ACTIVA");
      expect(result.cambios).toEqual([{ ...cambio("parada", "5", "ACTIVA", "CERRADA"), revertido: false }]);
    });

    it("activates an estación in MANTENIMIENTO (ACTIVA)", async () => {
      store.set("estacion", "3", "MANTENIMIENTO");

      await service.create(baseDto({ accion: AccionAfectacion.ACTIVAR, idEstacion: "3" }), ACTOR);

      expect(store.estado("estacion", "3")).toBe("ACTIVA");
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.objectContaining({
          action: INFRASTRUCTURE_AUDIT_ACTIONS.ACTIVATE,
          entityType: "estacion",
          detalle: expect.objectContaining({ estadoAnterior: "MANTENIMIENTO", estadoNuevo: "ACTIVA", cascada: [] }),
        })
      );
    });

    it("deactivates a municipalidad without líneas", async () => {
      store.set("municipalidad", "9", "ACTIVA");

      const result = await service.create(baseDto({ idMunicipalidad: "9" }), ACTOR);

      expect(store.estado("municipalidad", "9")).toBe("INACTIVA");
      expect(result.idMunicipalidad).toBe("9");
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.objectContaining({ action: "deactivate", entityType: "municipalidad", entityId: "9" })
      );
    });

    it.each([
      ["no target", {}],
      ["municipalidad and línea", { idMunicipalidad: "9", idLinea: "1" }],
      ["parada and estación", { idParada: "5", idEstacion: "3" }],
    ])("rejects %s with 400 and writes nothing", async (_label, targets) => {
      const error = await service.create(baseDto(targets), ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(
        "Debe proporcionar exactamente uno: idMunicipalidad, idLinea, idParada o idEstacion"
      );
      expectNothingWritten();
    });

    it("rejects a fechaFin before fechaInicio with 400 and writes nothing", async () => {
      store.set("linea", "1", "ACTIVA");
      const error = await service
        .create(baseDto({ idLinea: "1", fechaFin: "2026-10-20" }), ACTOR)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe("La fecha de fin no puede ser anterior a la fecha de inicio");
      expectNothingWritten();
    });

    it.each([
      ["municipalidad", { idMunicipalidad: "999" }, "Municipalidad con ID 999 no encontrada"],
      ["línea", { idLinea: "999" }, "Línea con ID 999 no encontrada"],
      ["parada", { idParada: "999" }, "Parada con ID 999 no encontrada"],
      ["estación", { idEstacion: "999" }, "Estación con ID 999 no encontrada"],
    ])("throws 404 naming the missing %s and writes nothing", async (_label, targets, message) => {
      const error = await service.create(baseDto(targets), ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(message);
      expectNothingWritten();
    });

    it.each<[string, AccionAfectacion, Partial<CreateAfectacionDto>, () => void, string]>([
      ["deactivating an inactive línea", AccionAfectacion.DESACTIVAR, { idLinea: "1" }, () => store.set("linea", "1", "INACTIVA"), "La línea ya está inactiva"],
      ["activating an active parada", AccionAfectacion.ACTIVAR, { idParada: "5" }, () => store.set("parada", "5", "ACTIVA"), "La parada ya está activa"],
      ["deactivating a closed estación", AccionAfectacion.DESACTIVAR, { idEstacion: "3" }, () => store.set("estacion", "3", "CERRADA"), "La estación ya está inactiva"],
      ["deactivating an inactive municipalidad", AccionAfectacion.DESACTIVAR, { idMunicipalidad: "9" }, () => store.set("municipalidad", "9", "INACTIVA"), "La municipalidad ya está inactiva"],
    ])("rejects %s with 409 AFECTACION_SIN_CAMBIO and writes nothing", async (_label, accion, targets, arrange, message) => {
      arrange();

      const error = await service.create(baseDto({ accion, ...targets }), ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(message);
      expect(errorCode(error)).toBe("AFECTACION_SIN_CAMBIO");
      expectNothingWritten();
    });
  });

  describe("create — DESACTIVAR cascade (S6/S7)", () => {
    // Línea 1 (target) owns: parada 10 (exclusive, estación 30), parada 11
    // (shared with ACTIVA línea 2), parada 12 (shared with INACTIVA línea 3),
    // parada 13 already CERRADA, parada 14 linked only through estación 34.
    beforeEach(() => {
      store.set("linea", "1", "ACTIVA").set("linea", "2", "ACTIVA").set("linea", "3", "INACTIVA");
      for (const p of ["10", "11", "12", "14"]) store.set("parada", p, "ACTIVA");
      store.set("parada", "13", "CERRADA").estacion("30", "10").estacion("34", "14");
      store.lineaParada.push(["1", "10"], ["1", "11"], ["2", "11"], ["1", "12"], ["3", "12"], ["1", "13"]);
      store.estacionLinea.push(["1", "34"]);
    });

    it("closes only the paradas (and estaciones) no other ACTIVA línea owns", async () => {
      const result = await service.create(baseDto({ idLinea: "1" }), ACTOR);

      expect(store.estado("linea", "1")).toBe("INACTIVA");
      expect(store.estado("parada", "10")).toBe("CERRADA");
      expect(store.estado("estacion", "30")).toBe("CERRADA");
      expect(store.estado("parada", "11")).toBe("ACTIVA");
      expect(store.estado("parada", "12")).toBe("CERRADA");
      expect(store.estado("parada", "13")).toBe("CERRADA");
      expect(store.estado("parada", "14")).toBe("CERRADA");
      expect(store.estado("estacion", "34")).toBe("CERRADA");
      expect(result.cambios.map((c) => `${c.entidadTipo}:${c.entidadId}`)).toEqual([
        "linea:1",
        "parada:10",
        "parada:12",
        "parada:14",
        "estacion:30",
        "estacion:34",
      ]);
      expect(store.cambiosDeAfectacion("100")).toHaveLength(6);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.objectContaining({
          action: "deactivate",
          entityType: "linea",
          entityId: "1",
          detalle: expect.objectContaining({
            estadoAnterior: "ACTIVA",
            estadoNuevo: "INACTIVA",
            cascada: [
              cambio("parada", "10", "ACTIVA", "CERRADA"),
              cambio("parada", "12", "ACTIVA", "CERRADA"),
              cambio("parada", "14", "ACTIVA", "CERRADA"),
              cambio("estacion", "30", "ACTIVA", "CERRADA"),
              cambio("estacion", "34", "ACTIVA", "CERRADA"),
            ],
          }),
        })
      );
    });

    it("locks every row it reads in kind-then-numeric-id order", async () => {
      store.set("linea", "9", "ACTIVA");
      store.lineaParada.push(["9", "10"]);
      store.set("linea", "9", "INACTIVA");

      await service.create(baseDto({ idLinea: "1" }), ACTOR);

      expect(store.lockCalls.length).toBeGreaterThan(0);
      for (const call of store.lockCalls) {
        const sorted = ordenarRefs(call.map((k) => ({ tipo: k.split(":")[0] as EntidadTipo, id: k.split(":")[1]! })));
        expect(call).toEqual(sorted.map(refKey));
      }
      const all = store.lockCalls.flat();
      for (const key of ["linea:1", "linea:2", "linea:3", "linea:9", "parada:10", "parada:11", "estacion:30"]) {
        expect(all).toContain(key);
      }
    });
  });

  describe("create — municipalidad cascade (S6)", () => {
    // Municipalidad 1 (target) has: línea 1 (exclusive), línea 2 (also in
    // ACTIVA municipalidad 2), línea 3 (also in INACTIVA municipalidad 3),
    // línea 4 already INACTIVA. Parada 20 is shared only by líneas 1 and 3
    // (both being deactivated); parada 21 by líneas 1 and 2; parada 22 by
    // línea 4 only.
    beforeEach(() => {
      store.set("municipalidad", "1", "ACTIVA").set("municipalidad", "2", "ACTIVA").set("municipalidad", "3", "INACTIVA");
      store.set("linea", "1", "ACTIVA").set("linea", "2", "ACTIVA").set("linea", "3", "ACTIVA").set("linea", "4", "INACTIVA");
      store.lineaMunicipalidad.push(["1", "1"], ["2", "1"], ["2", "2"], ["3", "1"], ["3", "3"], ["4", "1"]);
      store.set("parada", "20", "ACTIVA").set("parada", "21", "ACTIVA").set("parada", "22", "ACTIVA");
      store.lineaParada.push(["1", "20"], ["3", "20"], ["1", "21"], ["2", "21"], ["4", "22"]);
    });

    it("deactivates the exclusive líneas and closes paradas shared only among them", async () => {
      const result = await service.create(baseDto({ idMunicipalidad: "1" }), ACTOR);

      expect(store.estado("municipalidad", "1")).toBe("INACTIVA");
      expect(store.estado("linea", "1")).toBe("INACTIVA");
      expect(store.estado("linea", "2")).toBe("ACTIVA");
      expect(store.estado("linea", "3")).toBe("INACTIVA");
      expect(store.estado("linea", "4")).toBe("INACTIVA");
      expect(store.estado("parada", "20")).toBe("CERRADA");
      expect(store.estado("parada", "21")).toBe("ACTIVA");
      expect(store.estado("parada", "22")).toBe("ACTIVA");
      expect(result.cambios.map((c) => `${c.entidadTipo}:${c.entidadId}`)).toEqual([
        "municipalidad:1",
        "linea:1",
        "linea:3",
        "parada:20",
      ]);
    });
  });

  describe("create — ACTIVAR restores the cascade (S8)", () => {
    beforeEach(() => {
      store.set("municipalidad", "1", "INACTIVA");
      store.set("linea", "1", "INACTIVA").set("linea", "4", "INACTIVA");
      store.set("parada", "10", "CERRADA").set("parada", "11", "MANTENIMIENTO").estacion("30", "10", "CERRADA");
      store.seedAfectacion({ idAfectacion: "50", idMunicipalidad: "1" }, [
        cambio("municipalidad", "1", "ACTIVA", "INACTIVA"),
        cambio("linea", "1", "ACTIVA", "INACTIVA"),
        cambio("parada", "10", "ACTIVA", "CERRADA"),
        cambio("parada", "11", "MANTENIMIENTO", "CERRADA"),
        cambio("estacion", "30", "ACTIVA", "CERRADA"),
      ]);
    });

    it("restores only items still in the state the cascade set; earlier-inactive items stay", async () => {
      // Parada 11 was changed by hand after the cascade: it is no longer CERRADA.
      store.set("parada", "11", "ACTIVA");

      const result = await service.create(
        baseDto({ accion: AccionAfectacion.ACTIVAR, motivo: "Reapertura", idMunicipalidad: "1" }),
        ACTOR
      );

      expect(store.estado("municipalidad", "1")).toBe("ACTIVA");
      expect(store.estado("linea", "1")).toBe("ACTIVA");
      expect(store.estado("linea", "4")).toBe("INACTIVA");
      expect(store.estado("parada", "10")).toBe("ACTIVA");
      expect(store.estado("estacion", "30")).toBe("ACTIVA");
      expect(store.estado("parada", "11")).toBe("ACTIVA");
      expect(result.cambios).toEqual([
        { ...cambio("municipalidad", "1", "INACTIVA", "ACTIVA"), revertido: false },
        { ...cambio("linea", "1", "INACTIVA", "ACTIVA"), revertido: false },
        { ...cambio("parada", "10", "CERRADA", "ACTIVA"), revertido: false },
        { ...cambio("estacion", "30", "CERRADA", "ACTIVA"), revertido: false },
      ]);
      expect(store.cambiosDeAfectacion("50").every((c) => c.revertido)).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.objectContaining({
          action: "activate",
          entityType: "municipalidad",
          detalle: expect.objectContaining({
            cascada: [
              cambio("linea", "1", "INACTIVA", "ACTIVA"),
              cambio("parada", "10", "CERRADA", "ACTIVA"),
              cambio("estacion", "30", "CERRADA", "ACTIVA"),
            ],
          }),
        })
      );
    });

    it("restores a cascaded item to its previous state, not to ACTIVA", async () => {
      await service.create(baseDto({ accion: AccionAfectacion.ACTIVAR, idMunicipalidad: "1" }), ACTOR);

      expect(store.estado("parada", "11")).toBe("MANTENIMIENTO");
    });

    it("activates only the target when it has no DESACTIVAR still in effect", async () => {
      for (const c of store.cambios) c.revertido = true;

      const result = await service.create(baseDto({ accion: AccionAfectacion.ACTIVAR, idMunicipalidad: "1" }), ACTOR);

      expect(result.cambios.map((c) => c.entidadTipo)).toEqual(["municipalidad"]);
      expect(store.estado("linea", "1")).toBe("INACTIVA");
    });
  });

  describe("update (S10)", () => {
    beforeEach(() => {
      store.set("linea", "1", "INACTIVA").set("parada", "10", "CERRADA").set("parada", "11", "CERRADA");
      store.lineaParada.push(["1", "10"], ["1", "11"]);
      store.seedAfectacion(
        { idAfectacion: "60", idLinea: "1", motivo: "Obra", fechaInicio: "2026-10-21", fechaFin: "2026-10-25" },
        [cambio("linea", "1", "ACTIVA", "INACTIVA"), cambio("parada", "10", "ACTIVA", "CERRADA")]
      );
    });

    it("edits motivo and fechas without touching any state and audits changedFields", async () => {
      const result = await service.update("60", { motivo: "Obra larga", fechaFin: "2026-11-30" }, ACTOR);

      expect(result).toMatchObject({ idAfectacion: "60", accion: "DESACTIVAR", motivo: "Obra larga", fechaFin: "2026-11-30" });
      expect(store.writes).toEqual(["update afectacion 60"]);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: "afectacion",
        entityId: "60",
        detalle: { changedFields: ["motivo", "fechaFin"] },
      });
    });

    it("clears fechaFin with null", async () => {
      const result = await service.update("60", { fechaFin: null }, ACTOR);

      expect(result.fechaFin).toBeNull();
      expect(store.afectaciones.get("60")!.fechaFin).toBeNull();
    });

    it("edits motivo of an afectación that is not the latest one", async () => {
      store.seedAfectacion({ idAfectacion: "61", idLinea: "1", tipoAfectacion: "ACTIVAR" });

      await service.update("60", { motivo: "Corregido" }, ACTOR);

      expect(store.afectaciones.get("60")!.motivo).toBe("Corregido");
    });

    it("DESACTIVAR→ACTIVAR reverts exactly what the afectación changed", async () => {
      const result = await service.update("60", { accion: AccionAfectacion.ACTIVAR }, ACTOR);

      expect(store.estado("linea", "1")).toBe("ACTIVA");
      expect(store.estado("parada", "10")).toBe("ACTIVA");
      // Parada 11 was CERRADA before this afectación: it stays closed.
      expect(store.estado("parada", "11")).toBe("CERRADA");
      expect(result.accion).toBe("ACTIVAR");
      expect(result.cambios).toEqual([
        { ...cambio("linea", "1", "ACTIVA", "INACTIVA"), revertido: true },
        { ...cambio("parada", "10", "ACTIVA", "CERRADA"), revertido: true },
        { ...cambio("linea", "1", "INACTIVA", "ACTIVA"), revertido: false },
        { ...cambio("parada", "10", "CERRADA", "ACTIVA"), revertido: false },
      ]);
      expect(audit.record).toHaveBeenCalledTimes(2);
      expect(audit.record).toHaveBeenNthCalledWith(1, expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.ACTIVATE,
        entityType: "linea",
        entityId: "1",
        detalle: {
          idAfectacion: "60",
          motivo: "Obra",
          fechaInicio: "2026-10-21",
          fechaFin: "2026-10-25",
          estadoAnterior: "INACTIVA",
          estadoNuevo: "ACTIVA",
          cascada: [cambio("parada", "10", "CERRADA", "ACTIVA")],
        },
      });
      expect(audit.record).toHaveBeenNthCalledWith(2, expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: "afectacion",
        entityId: "60",
        detalle: { changedFields: ["accion"] },
      });
    });

    it("ACTIVAR→DESACTIVAR applies a fresh deactivation with cascade", async () => {
      await service.update("60", { accion: AccionAfectacion.ACTIVAR }, ACTOR);
      store.set("parada", "11", "ACTIVA");

      const result = await service.update("60", { accion: AccionAfectacion.DESACTIVAR }, ACTOR);

      expect(store.estado("linea", "1")).toBe("INACTIVA");
      expect(store.estado("parada", "10")).toBe("CERRADA");
      expect(store.estado("parada", "11")).toBe("CERRADA");
      expect(result.cambios.filter((c) => !c.revertido)).toEqual([
        { ...cambio("linea", "1", "ACTIVA", "INACTIVA"), revertido: false },
        { ...cambio("parada", "10", "ACTIVA", "CERRADA"), revertido: false },
        { ...cambio("parada", "11", "ACTIVA", "CERRADA"), revertido: false },
      ]);
    });

    it("rejects changing the acción of a non-latest afectación with 409 and writes nothing", async () => {
      store.seedAfectacion({ idAfectacion: "61", idLinea: "1", tipoAfectacion: "ACTIVAR" });

      const error = await service.update("60", { accion: AccionAfectacion.ACTIVAR, motivo: "x" }, ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(
        "Solo la afectación más reciente de este objetivo puede cambiar de acción"
      );
      expect(errorCode(error)).toBe("AFECTACION_NO_ES_ULTIMA");
      expectNothingWritten();
    });

    it("rejects an acción change that is a no-op on the target with 409 AFECTACION_SIN_CAMBIO", async () => {
      store.set("linea", "1", "ACTIVA");

      const error = await service.update("60", { accion: AccionAfectacion.ACTIVAR }, ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe("La línea ya está activa");
      expect(errorCode(error)).toBe("AFECTACION_SIN_CAMBIO");
      expectNothingWritten();
    });

    it("rejects changing the acción of a legacy afectación with 409", async () => {
      store.seedAfectacion({ idAfectacion: "70", idParada: "10", tipoAfectacion: "TEMPORAL" });

      const error = await service.update("70", { accion: AccionAfectacion.ACTIVAR }, ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("AFECTACION_ACCION_NO_EDITABLE");
      expect((error as Error).message).toBe(
        "Las afectaciones anteriores a activar/desactivar no pueden cambiar de acción"
      );
      expectNothingWritten();
    });

    it.each([
      ["fechaFin before the stored fechaInicio", { fechaFin: "2026-10-20" }],
      ["fechaInicio after the stored fechaFin", { fechaInicio: "2026-10-26" }],
    ])("rejects %s with 400 and writes nothing", async (_label, dto) => {
      const error = await service.update("60", dto, ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe("La fecha de fin no puede ser anterior a la fecha de inicio");
      expectNothingWritten();
    });

    it("throws 404 for a missing afectación", async () => {
      const error = await service.update("999", { motivo: "x" }, ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe("Afectación con ID 999 no encontrada");
      expectNothingWritten();
    });

    it("writes nothing when no field actually changes", async () => {
      const result = await service.update("60", { accion: AccionAfectacion.DESACTIVAR, motivo: "Obra" }, ACTOR);

      expect(result.motivo).toBe("Obra");
      expectNothingWritten();
    });
  });

  describe("findAll / findOne", () => {
    const stored = {
      idAfectacion: "7",
      tipoAfectacion: "DESACTIVAR",
      motivo: "Fin de obra",
      fechaInicio: "2026-10-21",
      fechaFin: null,
      estadoAfectacion: "APLICADA",
      idMunicipalidad: null,
      idLinea: "1",
      idParada: null,
      idEstacion: null,
    };

    beforeEach(() => {
      store.seedAfectacion({ idAfectacion: "7", idLinea: "1" }, [cambio("linea", "1", "ACTIVA", "INACTIVA")]);
    });

    it("lists afectaciones newest first with their cambios", async () => {
      afectacionRepo.find.mockResolvedValue([stored]);

      const result = await service.findAll();

      expect(afectacionRepo.find).toHaveBeenCalledWith({ order: { fechaInicio: "DESC", idAfectacion: "DESC" } });
      expect(result).toEqual([
        {
          idAfectacion: "7",
          accion: "DESACTIVAR",
          motivo: "Fin de obra",
          fechaInicio: "2026-10-21",
          fechaFin: null,
          idMunicipalidad: null,
          idLinea: "1",
          idParada: null,
          idEstacion: null,
          cambios: [{ ...cambio("linea", "1", "ACTIVA", "INACTIVA"), revertido: false }],
        },
      ]);
    });

    it("returns one afectación when found", async () => {
      afectacionRepo.findOne.mockResolvedValue(stored);

      const result = await service.findOne("7");

      expect(afectacionRepo.findOne).toHaveBeenCalledWith({ where: { idAfectacion: "7" } });
      expect(result.cambios).toHaveLength(1);
    });

    it("throws 404 when not found", async () => {
      afectacionRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow("Afectación con ID missing no encontrada");
    });
  });
});
