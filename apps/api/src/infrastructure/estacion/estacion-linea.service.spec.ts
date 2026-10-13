// EstacionLineaService unit tests (mocked repositories, direct instantiation).

import { jest } from "@jest/globals";
import {
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
import type { EstacionEntity } from "./estacion.entity.js";
import {
  EstacionLineaEntity,
  EstadoAsignacionLinea,
  TipoPunto,
} from "./estacion-linea.entity.js";
import { EstacionLineaService } from "./estacion-linea.service.js";
import type { LineaEntity } from "../linea/linea.entity.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockRepository = {
  create: AnyMock;
  save: AnyMock;
  find: AnyMock;
  findOne: AnyMock;
  count: AnyMock;
  remove: AnyMock;
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
    remove: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const manager = { getRepository: () => repo } as unknown as EntityManager;
  repo.manager.transaction.mockImplementation(
    async (cb: (m: EntityManager) => unknown) => cb(manager)
  );
  return repo;
}

function makeLink(
  overrides: Partial<EstacionLineaEntity> = {}
): EstacionLineaEntity {
  return {
    idEstacion: "7",
    idLinea: "3",
    tipoPunto: TipoPunto.PRINCIPAL,
    estadoAsignacion: EstadoAsignacionLinea.ACTIVA,
    linea: { nombreLinea: "Línea 3" } as LineaEntity,
    ...overrides,
  };
}

function errorCode(error: unknown): unknown {
  return ((error as HttpException).getResponse() as { error?: string }).error;
}

describe("EstacionLineaService", () => {
  let linkRepo: MockRepository;
  let estacionRepo: MockRepository;
  let lineaRepo: MockRepository;
  let audit: { record: AnyMock };
  let service: EstacionLineaService;

  beforeEach(() => {
    linkRepo = makeMockRepository();
    estacionRepo = makeMockRepository();
    lineaRepo = makeMockRepository();
    audit = { record: jest.fn() };
    service = new EstacionLineaService(
      linkRepo as unknown as Repository<EstacionLineaEntity>,
      estacionRepo as unknown as Repository<EstacionEntity>,
      lineaRepo as unknown as Repository<LineaEntity>,
      audit as unknown as InfrastructureAuditService
    );
  });

  describe("list", () => {
    it("returns the links mapped to response DTOs", async () => {
      estacionRepo.count.mockResolvedValue(1);
      linkRepo.find.mockResolvedValue([makeLink()]);

      await expect(service.list("7")).resolves.toEqual([
        {
          idEstacion: "7",
          idLinea: "3",
          nombreLinea: "Línea 3",
          tipoPunto: TipoPunto.PRINCIPAL,
          estadoAsignacion: EstadoAsignacionLinea.ACTIVA,
        },
      ]);
    });

    it("throws NotFoundException when the station does not exist", async () => {
      estacionRepo.count.mockResolvedValue(0);
      await expect(service.list("99")).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.find).not.toHaveBeenCalled();
    });
  });

  describe("add", () => {
    const dto = { idLinea: "3", tipoPunto: TipoPunto.CONTROL };

    it("creates the link defaulting estadoAsignacion to ACTIVA", async () => {
      estacionRepo.count.mockResolvedValue(1);
      lineaRepo.count.mockResolvedValue(1);
      linkRepo.findOne.mockResolvedValue(null);
      linkRepo.create.mockImplementation((v) => v);
      linkRepo.save.mockImplementation(async (v) => v);

      const result = await service.add("7", dto, ACTOR);

      expect(linkRepo.create).toHaveBeenCalledWith({
        idEstacion: "7",
        idLinea: "3",
        tipoPunto: TipoPunto.CONTROL,
        estadoAsignacion: EstadoAsignacionLinea.ACTIVA,
      });
      expect(result.estadoAsignacion).toBe(EstadoAsignacionLinea.ACTIVA);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.LINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION_LINEA,
        entityId: "7",
        detalle: {
          idLinea: "3",
          tipoPunto: TipoPunto.CONTROL,
          estadoAsignacion: EstadoAsignacionLinea.ACTIVA,
        },
      });
    });

    it("respects an explicit estadoAsignacion", async () => {
      estacionRepo.count.mockResolvedValue(1);
      lineaRepo.count.mockResolvedValue(1);
      linkRepo.findOne.mockResolvedValue(null);
      linkRepo.create.mockImplementation((v) => v);
      linkRepo.save.mockImplementation(async (v) => v);

      const result = await service.add(
        "7",
        { ...dto, estadoAsignacion: EstadoAsignacionLinea.INACTIVA },
        ACTOR
      );

      expect(result.estadoAsignacion).toBe(EstadoAsignacionLinea.INACTIVA);
    });

    it("throws NotFoundException when the station does not exist", async () => {
      estacionRepo.count.mockResolvedValue(0);
      await expect(service.add("99", dto, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the line does not exist", async () => {
      estacionRepo.count.mockResolvedValue(1);
      lineaRepo.count.mockResolvedValue(0);
      await expect(service.add("7", dto, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("rejects a duplicate link with ESTACION_LINEA_DUPLICATE", async () => {
      estacionRepo.count.mockResolvedValue(1);
      lineaRepo.count.mockResolvedValue(1);
      linkRepo.findOne.mockResolvedValue(makeLink());

      const error = await service.add("7", dto, ACTOR).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("ESTACION_LINEA_DUPLICATE");
      expect(linkRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("updates only the provided fields", async () => {
      const link = makeLink();
      linkRepo.findOne.mockResolvedValue(link);
      linkRepo.save.mockImplementation(async (v) => v);

      const result = await service.update(
        "7",
        "3",
        { estadoAsignacion: EstadoAsignacionLinea.INACTIVA },
        ACTOR
      );

      expect(result.estadoAsignacion).toBe(EstadoAsignacionLinea.INACTIVA);
      expect(result.tipoPunto).toBe(TipoPunto.PRINCIPAL);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION_LINEA,
        entityId: "7",
        detalle: { idLinea: "3", changedFields: ["estadoAsignacion"] },
      });
    });

    it("throws NotFoundException when the link does not exist", async () => {
      linkRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update("7", "3", { tipoPunto: TipoPunto.APOYO }, ACTOR)
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("removes the link row", async () => {
      const link = makeLink();
      linkRepo.findOne.mockResolvedValue(link);

      await service.remove("7", "3", ACTOR);

      expect(linkRepo.remove).toHaveBeenCalledWith(link);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UNLINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.ESTACION_LINEA,
        entityId: "7",
        detalle: { idLinea: "3" },
      });
    });

    it("throws NotFoundException when the link does not exist", async () => {
      linkRepo.findOne.mockResolvedValue(null);
      await expect(service.remove("7", "3", ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.remove).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
