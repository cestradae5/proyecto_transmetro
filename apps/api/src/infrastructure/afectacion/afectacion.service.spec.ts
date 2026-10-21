// AfectacionService unit tests (mocked repositories).
// An afectación activates or deactivates exactly one línea, parada or estación:
// the target state, the afectación row and the bitácora row are written in one
// transaction. Rejected requests write nothing.

import { jest } from "@jest/globals";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import type { EntityManager, Repository } from "typeorm";

import type { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";
import { AccionAfectacion, AfectacionEntity } from "./afectacion.entity.js";
import { AfectacionService } from "./afectacion.service.js";
import type { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import { LineaEntity } from "../linea/linea.entity.js";
import { ParadaEntity } from "../parada/parada.entity.js";
import { EstacionEntity } from "../estacion/estacion.entity.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockRepository = {
  create: AnyMock;
  save: AnyMock;
  find: AnyMock;
  findOne: AnyMock;
};

const ACTOR = "7";

function makeMockRepository(): MockRepository {
  return {
    create: jest.fn((data: unknown) => ({ ...(data as object) })),
    save: jest.fn(async (row: unknown) => row),
    find: jest.fn(),
    findOne: jest.fn(),
  };
}

function baseDto(overrides: Partial<CreateAfectacionDto> = {}): CreateAfectacionDto {
  return {
    accion: AccionAfectacion.DESACTIVAR,
    motivo: "Obra vial",
    fechaInicio: "2026-10-21",
    ...overrides,
  };
}

describe("AfectacionService", () => {
  let afectacionRepo: MockRepository & { manager: { transaction: AnyMock } };
  let lineaRepo: MockRepository;
  let paradaRepo: MockRepository;
  let estacionRepo: MockRepository;
  let audit: { record: AnyMock };
  let service: AfectacionService;

  beforeEach(() => {
    lineaRepo = makeMockRepository();
    paradaRepo = makeMockRepository();
    estacionRepo = makeMockRepository();
    const txAfectacionRepo = makeMockRepository();
    txAfectacionRepo.save.mockImplementation(async (row: unknown) => ({
      ...(row as object),
      idAfectacion: "11",
    }));
    const repos = new Map<unknown, MockRepository>([
      [LineaEntity, lineaRepo],
      [ParadaEntity, paradaRepo],
      [EstacionEntity, estacionRepo],
      [AfectacionEntity, txAfectacionRepo],
    ]);
    const manager = {
      getRepository: (entity: unknown) => repos.get(entity),
    } as unknown as EntityManager;
    afectacionRepo = {
      ...txAfectacionRepo,
      manager: {
        transaction: jest.fn(async (cb: (m: EntityManager) => unknown) => cb(manager)),
      },
    };
    audit = { record: jest.fn() };
    service = new AfectacionService(
      afectacionRepo as unknown as Repository<AfectacionEntity>,
      audit as unknown as InfrastructureAuditService
    );
  });

  describe("create", () => {
    it("deactivates a línea, stores the afectación and records it in the bitácora", async () => {
      const linea = { idLinea: "1", estadoLinea: "ACTIVA" };
      lineaRepo.findOne.mockResolvedValue(linea);

      const result = await service.create(
        baseDto({ idLinea: "1", fechaFin: "2026-10-25" }),
        ACTOR
      );

      expect(lineaRepo.findOne).toHaveBeenCalledWith({
        where: { idLinea: "1" },
        lock: { mode: "pessimistic_write" },
      });
      expect(lineaRepo.save).toHaveBeenCalledWith({ idLinea: "1", estadoLinea: "INACTIVA" });
      expect(result).toEqual({
        idAfectacion: "11",
        accion: AccionAfectacion.DESACTIVAR,
        motivo: "Obra vial",
        fechaInicio: "2026-10-21",
        fechaFin: "2026-10-25",
        idLinea: "1",
        idParada: null,
        idEstacion: null,
      });
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.DEACTIVATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
        entityId: "1",
        detalle: {
          idAfectacion: "11",
          motivo: "Obra vial",
          fechaInicio: "2026-10-21",
          fechaFin: "2026-10-25",
          estadoAnterior: "ACTIVA",
          estadoNuevo: "INACTIVA",
        },
      });
    });

    it("activates an inactive línea", async () => {
      lineaRepo.findOne.mockResolvedValue({ idLinea: "1", estadoLinea: "INACTIVA" });

      await service.create(baseDto({ accion: AccionAfectacion.ACTIVAR, idLinea: "1" }), ACTOR);

      expect(lineaRepo.save).toHaveBeenCalledWith({ idLinea: "1", estadoLinea: "ACTIVA" });
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.objectContaining({
          action: INFRASTRUCTURE_AUDIT_ACTIONS.ACTIVATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
          detalle: expect.objectContaining({ estadoAnterior: "INACTIVA", estadoNuevo: "ACTIVA" }),
        })
      );
    });

    it("deactivates a parada (CERRADA) and audits it as a parada", async () => {
      paradaRepo.findOne.mockResolvedValue({ idParada: "5", estadoParada: "ACTIVA" });

      const result = await service.create(baseDto({ idParada: "5" }), ACTOR);

      expect(paradaRepo.save).toHaveBeenCalledWith({ idParada: "5", estadoParada: "CERRADA" });
      expect(result.idParada).toBe("5");
      expect(result.fechaFin).toBeNull();
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.objectContaining({
          action: INFRASTRUCTURE_AUDIT_ACTIONS.DEACTIVATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.PARADA,
          entityId: "5",
        })
      );
    });

    it("activates an estación in MANTENIMIENTO (ACTIVA)", async () => {
      estacionRepo.findOne.mockResolvedValue({ idEstacion: "3", estadoEstacion: "MANTENIMIENTO" });

      await service.create(baseDto({ accion: AccionAfectacion.ACTIVAR, idEstacion: "3" }), ACTOR);

      expect(estacionRepo.save).toHaveBeenCalledWith({ idEstacion: "3", estadoEstacion: "ACTIVA" });
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.objectContaining({
          action: INFRASTRUCTURE_AUDIT_ACTIONS.ACTIVATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION,
          entityId: "3",
          detalle: expect.objectContaining({
            estadoAnterior: "MANTENIMIENTO",
            estadoNuevo: "ACTIVA",
          }),
        })
      );
    });

    it.each([
      ["no target", {}],
      ["línea and parada", { idLinea: "1", idParada: "5" }],
      ["parada and estación", { idParada: "5", idEstacion: "3" }],
    ])("rejects %s with 400 and writes nothing", async (_label, targets) => {
      const error = await service.create(baseDto(targets), ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(
        "Debe proporcionar exactamente uno: idLinea, idParada o idEstacion"
      );
      expect(afectacionRepo.manager.transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("rejects a fechaFin before fechaInicio with 400 and writes nothing", async () => {
      const error = await service
        .create(baseDto({ idLinea: "1", fechaInicio: "2026-10-21", fechaFin: "2026-10-20" }), ACTOR)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(
        "La fecha de fin no puede ser anterior a la fecha de inicio"
      );
      expect(afectacionRepo.manager.transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each([
      ["línea", { idLinea: "999" }, "Línea con ID 999 no encontrada"],
      ["parada", { idParada: "999" }, "Parada con ID 999 no encontrada"],
      ["estación", { idEstacion: "999" }, "Estación con ID 999 no encontrada"],
    ])("throws 404 naming the missing %s and writes nothing", async (_label, targets, message) => {
      const error = await service.create(baseDto(targets), ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as Error).message).toBe(message);
      expect(lineaRepo.save).not.toHaveBeenCalled();
      expect(paradaRepo.save).not.toHaveBeenCalled();
      expect(estacionRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each([
      [
        "deactivating an inactive línea",
        AccionAfectacion.DESACTIVAR,
        { idLinea: "1" },
        () => lineaRepo.findOne.mockResolvedValue({ idLinea: "1", estadoLinea: "INACTIVA" }),
        "La línea ya está inactiva",
      ],
      [
        "activating an active parada",
        AccionAfectacion.ACTIVAR,
        { idParada: "5" },
        () => paradaRepo.findOne.mockResolvedValue({ idParada: "5", estadoParada: "ACTIVA" }),
        "La parada ya está activa",
      ],
      [
        "deactivating a closed estación",
        AccionAfectacion.DESACTIVAR,
        { idEstacion: "3" },
        () => estacionRepo.findOne.mockResolvedValue({ idEstacion: "3", estadoEstacion: "CERRADA" }),
        "La estación ya está inactiva",
      ],
    ])("rejects %s with 409 and changes nothing", async (_label, accion, targets, arrange, message) => {
      arrange();

      const error = await service
        .create(baseDto({ accion, ...targets }), ACTOR)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as Error).message).toBe(message);
      expect(((error as HttpException).getResponse() as { error?: string }).error).toBe(
        "AFECTACION_SIN_CAMBIO"
      );
      expect(lineaRepo.save).not.toHaveBeenCalled();
      expect(paradaRepo.save).not.toHaveBeenCalled();
      expect(estacionRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("findAll / findOne", () => {
    const stored = {
      idAfectacion: "7",
      tipoAfectacion: "ACTIVAR",
      motivo: "Fin de obra",
      fechaInicio: "2026-10-21",
      fechaFin: null,
      estadoAfectacion: "APLICADA",
      idLinea: null,
      idParada: "5",
      idEstacion: null,
    };

    it("lists afectaciones newest first, mapped to the response DTO", async () => {
      afectacionRepo.find.mockResolvedValue([stored]);

      const result = await service.findAll();

      expect(afectacionRepo.find).toHaveBeenCalledWith({
        order: { fechaInicio: "DESC", idAfectacion: "DESC" },
      });
      expect(result).toEqual([
        {
          idAfectacion: "7",
          accion: "ACTIVAR",
          motivo: "Fin de obra",
          fechaInicio: "2026-10-21",
          fechaFin: null,
          idLinea: null,
          idParada: "5",
          idEstacion: null,
        },
      ]);
    });

    it("returns one afectación when found", async () => {
      afectacionRepo.findOne.mockResolvedValue(stored);

      const result = await service.findOne("7");

      expect(afectacionRepo.findOne).toHaveBeenCalledWith({ where: { idAfectacion: "7" } });
      expect(result.motivo).toBe("Fin de obra");
    });

    it("throws 404 when not found", async () => {
      afectacionRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow(
        "Afectación con ID missing no encontrada"
      );
    });
  });
});
