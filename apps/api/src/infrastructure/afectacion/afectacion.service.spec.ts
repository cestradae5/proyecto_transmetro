// PR#3 infraestructura-hardening — AfectacionService unit tests (mocked repositories).
// Same pattern as parada.service.spec.ts: direct instantiation, no TestingModule.

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
import {
  AfectacionEntity,
  EstadoAfectacion,
  TipoAfectacion,
} from "./afectacion.entity.js";
import { AfectacionService } from "./afectacion.service.js";
import type { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import type { ParadaEntity } from "../parada/parada.entity.js";
import type { EstacionEntity } from "../estacion/estacion.entity.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockRepository = {
  create: AnyMock;
  save: AnyMock;
  find: AnyMock;
  findOne: AnyMock;
  count: AnyMock;
  manager: { transaction: AnyMock };
};

const ACTOR = "7";

function makeMockRepository(): MockRepository {
  const repo: MockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const manager = { getRepository: () => repo } as unknown as EntityManager;
  repo.manager.transaction.mockImplementation(
    async (cb: (m: EntityManager) => unknown) => cb(manager)
  );
  return repo;
}

function makeAfectacion(
  overrides: Partial<AfectacionEntity> = {}
): AfectacionEntity {
  return {
    idAfectacion: "7",
    tipoAfectacion: TipoAfectacion.MANTENIMIENTO,
    motivo: "Reparación de acera",
    fechaInicio: new Date("2025-01-15T08:00:00Z"),
    fechaFin: undefined,
    estadoAfectacion: EstadoAfectacion.ACTIVA,
    idParada: "5",
    idEstacion: undefined,
    ...overrides,
  };
}

function baseDto(overrides: Partial<CreateAfectacionDto> = {}): CreateAfectacionDto {
  return {
    tipoAfectacion: TipoAfectacion.MANTENIMIENTO as never,
    motivo: "Reparación de acera",
    fechaInicio: "2025-01-15T08:00:00Z",
    estadoAfectacion: EstadoAfectacion.ACTIVA as never,
    ...overrides,
  };
}

describe("AfectacionService", () => {
  let afectacionRepo: MockRepository;
  let paradaRepo: MockRepository;
  let estacionRepo: MockRepository;
  let audit: { record: AnyMock };
  let service: AfectacionService;

  beforeEach(() => {
    afectacionRepo = makeMockRepository();
    paradaRepo = makeMockRepository();
    estacionRepo = makeMockRepository();
    audit = { record: jest.fn() };
    service = new AfectacionService(
      afectacionRepo as unknown as Repository<AfectacionEntity>,
      paradaRepo as unknown as Repository<ParadaEntity>,
      estacionRepo as unknown as Repository<EstacionEntity>,
      audit as unknown as InfrastructureAuditService
    );
  });

  describe("create", () => {
    it("creates an afectación at a parada", async () => {
      paradaRepo.count.mockResolvedValue(1);
      const saved = makeAfectacion();
      afectacionRepo.create.mockReturnValue(saved);
      afectacionRepo.save.mockResolvedValue(saved);

      const result = await service.create(baseDto({ idParada: "5" }), ACTOR);

      expect(paradaRepo.count).toHaveBeenCalledWith({ where: { idParada: "5" } });
      expect(estacionRepo.count).not.toHaveBeenCalled();
      expect(result.idAfectacion).toBe("7");
      expect(result.idParada).toBe("5");
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
        entityId: "7",
        detalle: { tipoAfectacion: TipoAfectacion.MANTENIMIENTO, idParada: "5", idEstacion: null },
      });
    });

    it("creates an afectación at an estación", async () => {
      estacionRepo.count.mockResolvedValue(1);
      const saved = makeAfectacion({ idParada: undefined, idEstacion: "3" });
      afectacionRepo.create.mockReturnValue(saved);
      afectacionRepo.save.mockResolvedValue(saved);

      const result = await service.create(baseDto({ idEstacion: "3" }), ACTOR);

      expect(estacionRepo.count).toHaveBeenCalledWith({
        where: { idEstacion: "3" },
      });
      expect(paradaRepo.count).not.toHaveBeenCalled();
      expect(result.idEstacion).toBe("3");
    });

    it("rejects both parada and estación (XOR violation)", async () => {
      await expect(
        service.create(baseDto({ idParada: "5", idEstacion: "3" }), ACTOR)
      ).rejects.toThrow(BadRequestException);
      expect(afectacionRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("rejects neither parada nor estación (XOR violation)", async () => {
      await expect(service.create(baseDto(), ACTOR)).rejects.toThrow(
        BadRequestException
      );
      expect(afectacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      paradaRepo.count.mockResolvedValue(0);

      await expect(service.create(baseDto({ idParada: "999" }), ACTOR)).rejects.toThrow(
        NotFoundException
      );
      // The message must name the entity idParada actually references, never the
      // sibling idEstacion this payload deliberately leaves out.
      await expect(service.create(baseDto({ idParada: "999" }), ACTOR)).rejects.toThrow(
        "Parada con ID 999 no encontrada"
      );
      expect(afectacionRepo.save).not.toHaveBeenCalled();
    });

    it("names the estación when idEstacion does not exist", async () => {
      estacionRepo.count.mockResolvedValue(0);

      await expect(service.create(baseDto({ idEstacion: "999" }), ACTOR)).rejects.toThrow(
        "Estación con ID 999 no encontrada"
      );
      expect(estacionRepo.count).toHaveBeenCalledWith({
        where: { idEstacion: "999" },
      });
      expect(paradaRepo.count).not.toHaveBeenCalled();
      expect(afectacionRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("findAll / findOne", () => {
    it("maps every afectación to its response DTO", async () => {
      afectacionRepo.find.mockResolvedValue([
        makeAfectacion(),
        makeAfectacion({ idAfectacion: "8" }),
      ]);

      const result = await service.findAll();

      expect(result.map((a) => a.idAfectacion)).toEqual(["7", "8"]);
    });

    it("returns the afectación when found", async () => {
      afectacionRepo.findOne.mockResolvedValue(makeAfectacion());

      const result = await service.findOne("7");

      expect(afectacionRepo.findOne).toHaveBeenCalledWith({
        where: { idAfectacion: "7" },
      });
      expect(result.motivo).toBe("Reparación de acera");
    });

    it("throws NotFoundException when not found", async () => {
      afectacionRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow(
        "Afectación con ID missing no encontrada"
      );
    });
  });

  describe("update", () => {
    it("updates motivo", async () => {
      afectacionRepo.findOne.mockResolvedValue(makeAfectacion());
      afectacionRepo.save.mockImplementation(async (a: AfectacionEntity) => a);

      const result = await service.update("7", { motivo: "Reparación ampliada" }, ACTOR);

      expect(result.motivo).toBe("Reparación ampliada");
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
        entityId: "7",
        detalle: { changedFields: ["motivo"] },
      });
    });

    it("rejects both idParada and idEstacion in the same update (XOR)", async () => {
      afectacionRepo.findOne.mockResolvedValue(makeAfectacion());

      await expect(
        service.update("7", { idParada: "5", idEstacion: "3" }, ACTOR)
      ).rejects.toThrow(BadRequestException);
      expect(afectacionRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("switching to an estación clears idParada", async () => {
      afectacionRepo.findOne.mockResolvedValue(makeAfectacion());
      estacionRepo.count.mockResolvedValue(1);
      afectacionRepo.save.mockImplementation(async (a: AfectacionEntity) => a);

      const result = await service.update("7", { idEstacion: "3" }, ACTOR);

      expect(result.idEstacion).toBe("3");
      expect(result.idParada).toBeUndefined();
    });

    it("throws NotFoundException when not found", async () => {
      afectacionRepo.findOne.mockResolvedValue(null);

      await expect(service.update("missing", {}, ACTOR)).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("remove", () => {
    it("soft-deletes by setting estadoAfectacion to CERRADA", async () => {
      const existing = makeAfectacion();
      afectacionRepo.findOne.mockResolvedValue(existing);
      afectacionRepo.save.mockResolvedValue(existing);

      await service.remove("7", ACTOR);

      expect(afectacionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoAfectacion: EstadoAfectacion.CERRADA })
      );
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
        entityId: "7",
        detalle: { tipoAfectacion: TipoAfectacion.MANTENIMIENTO },
      });
    });

    it("throws NotFoundException when not found", async () => {
      afectacionRepo.findOne.mockResolvedValue(null);

      await expect(service.remove("missing", ACTOR)).rejects.toThrow(NotFoundException);
    });
  });

  describe("close", () => {
    it("sets estado CERRADA and fechaFin to now", async () => {
      afectacionRepo.findOne.mockResolvedValue(makeAfectacion());
      afectacionRepo.save.mockImplementation(async (a: AfectacionEntity) => a);
      const before = Date.now();

      const result = await service.close("7", ACTOR);

      const after = Date.now();
      expect(result.estadoAfectacion).toBe(EstadoAfectacion.CERRADA);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.AFECTACION,
        entityId: "7",
        detalle: { estadoAfectacion: EstadoAfectacion.CERRADA, closed: true },
      });
      expect(result.fechaFin).toBeInstanceOf(Date);
      expect(result.fechaFin!.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.fechaFin!.getTime()).toBeLessThanOrEqual(after);
      expect(afectacionRepo.save).toHaveBeenCalledTimes(1);
    });

    it("throws NotFoundException when not found", async () => {
      afectacionRepo.findOne.mockResolvedValue(null);

      await expect(service.close("missing", ACTOR)).rejects.toThrow(NotFoundException);
      expect(afectacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws 409 when the afectación is already closed", async () => {
      const closedAt = new Date("2025-01-15T16:00:00Z");
      afectacionRepo.findOne.mockResolvedValue(
        makeAfectacion({
          estadoAfectacion: EstadoAfectacion.CERRADA,
          fechaFin: closedAt,
        })
      );

      const error = await service.close("7", ACTOR).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(
        ((error as HttpException).getResponse() as { error?: string }).error
      ).toBe("AFECTACION_ALREADY_CLOSED");
      expect(afectacionRepo.save).not.toHaveBeenCalled();
    });
  });
});
