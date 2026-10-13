// MunicipalidadService unit tests (mocked repository, direct instantiation).

import { jest } from "@jest/globals";
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { QueryFailedError, type EntityManager, type Repository } from "typeorm";

import type { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";
import {
  EstadoMunicipalidad,
  MunicipalidadEntity,
} from "./municipalidad.entity.js";
import { MunicipalidadService } from "./municipalidad.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

const ACTOR = "7";

type MockRepository = {
  create: AnyMock;
  save: AnyMock;
  find: AnyMock;
  findOne: AnyMock;
  manager: { transaction: AnyMock };
};

function makeMockRepository(): MockRepository {
  const repo: MockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  // transaction(cb) runs the callback with a manager whose getRepository
  // resolves back to this same mock repo, so the existing create/save
  // assertions keep working.
  const manager = { getRepository: () => repo } as unknown as EntityManager;
  repo.manager.transaction.mockImplementation(
    async (cb: (m: EntityManager) => unknown) => cb(manager)
  );
  return repo;
}

function makeMunicipalidad(
  overrides: Partial<MunicipalidadEntity> = {}
): MunicipalidadEntity {
  return {
    idMunicipalidad: "1",
    nombreMunicipalidad: "Guatemala",
    departamento: "Guatemala",
    estadoMunicipalidad: EstadoMunicipalidad.ACTIVA,
    ...overrides,
  };
}

function uniqueViolation(): QueryFailedError {
  return new QueryFailedError(
    "query",
    [],
    Object.assign(new Error("pg"), { code: "23505" })
  );
}

function errorCode(error: unknown): unknown {
  return ((error as HttpException).getResponse() as { error?: string }).error;
}

describe("MunicipalidadService", () => {
  let repo: MockRepository;
  let audit: { record: AnyMock };
  let service: MunicipalidadService;

  beforeEach(() => {
    repo = makeMockRepository();
    audit = { record: jest.fn() };
    service = new MunicipalidadService(
      repo as unknown as Repository<MunicipalidadEntity>,
      audit as unknown as InfrastructureAuditService
    );
  });

  describe("create", () => {
    const dto = { nombreMunicipalidad: "Mixco", departamento: "Guatemala" };

    it("creates the municipalidad defaulting estado to ACTIVA and audits it", async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((v) => v);
      repo.save.mockImplementation(async (v) => ({ ...v, idMunicipalidad: "5" }));

      const result = await service.create(dto, ACTOR);

      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        estadoMunicipalidad: EstadoMunicipalidad.ACTIVA,
      });
      expect(result).toEqual({
        idMunicipalidad: "5",
        nombreMunicipalidad: "Mixco",
        departamento: "Guatemala",
        estadoMunicipalidad: EstadoMunicipalidad.ACTIVA,
      });
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.MUNICIPALIDAD,
        entityId: "5",
        detalle: {
          nombreMunicipalidad: "Mixco",
          departamento: "Guatemala",
          estadoMunicipalidad: EstadoMunicipalidad.ACTIVA,
        },
      });
    });

    it("rejects a duplicate nombre with MUNICIPALIDAD_NOMBRE_DUPLICATE and does not audit", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad({ idMunicipalidad: "2" }));

      const error = await service.create(dto, ACTOR).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("MUNICIPALIDAD_NOMBRE_DUPLICATE");
      expect(repo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("translates a unique violation on save into 409", async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((v) => v);
      repo.save.mockRejectedValue(uniqueViolation());

      const error = await service.create(dto, ACTOR).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("MUNICIPALIDAD_NOMBRE_DUPLICATE");
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("rethrows other save errors untouched", async () => {
      const boom = new Error("db down");
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((v) => v);
      repo.save.mockRejectedValue(boom);

      await expect(service.create(dto, ACTOR)).rejects.toBe(boom);
    });
  });

  describe("findAll", () => {
    it("returns the municipalidades ordered by nombre", async () => {
      repo.find.mockResolvedValue([makeMunicipalidad()]);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalledWith({
        order: { nombreMunicipalidad: "ASC" },
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.nombreMunicipalidad).toBe("Guatemala");
    });
  });

  describe("findOne", () => {
    it("returns the municipalidad", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad());

      await expect(service.findOne("1")).resolves.toEqual(
        expect.objectContaining({ idMunicipalidad: "1" })
      );
    });

    it("throws NotFoundException when missing", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne("99")).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe("update", () => {
    it("updates the provided fields and audits the changed fields", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad());
      repo.save.mockImplementation(async (v) => v);

      const result = await service.update(
        "1",
        { departamento: "Sacatepéquez" },
        ACTOR
      );

      expect(result.departamento).toBe("Sacatepéquez");
      expect(result.nombreMunicipalidad).toBe("Guatemala");
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.MUNICIPALIDAD,
        entityId: "1",
        detalle: { changedFields: ["departamento"] },
      });
    });

    it("allows keeping the same nombre without a duplicate check", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad());
      repo.save.mockImplementation(async (v) => v);

      await service.update("1", { nombreMunicipalidad: "Guatemala" }, ACTOR);

      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it("rejects renaming to a nombre used by another municipalidad and does not audit", async () => {
      repo.findOne
        .mockResolvedValueOnce(makeMunicipalidad())
        .mockResolvedValueOnce(
          makeMunicipalidad({ idMunicipalidad: "2", nombreMunicipalidad: "Mixco" })
        );

      const error = await service
        .update("1", { nombreMunicipalidad: "Mixco" }, ACTOR)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("MUNICIPALIDAD_NOMBRE_DUPLICATE");
      expect(repo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when missing", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.update("99", { departamento: "X" }, ACTOR)
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("remove", () => {
    it("soft deletes by marking the municipalidad INACTIVA and audits it", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad());
      repo.save.mockImplementation(async (v) => v);

      await service.remove("1", ACTOR);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idMunicipalidad: "1",
          estadoMunicipalidad: EstadoMunicipalidad.INACTIVA,
        })
      );
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.MUNICIPALIDAD,
        entityId: "1",
        detalle: { nombreMunicipalidad: "Guatemala" },
      });
    });

    it("throws NotFoundException when missing and does not audit", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove("99", ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
