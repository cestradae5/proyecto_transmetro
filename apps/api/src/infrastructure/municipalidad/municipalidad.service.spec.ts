// MunicipalidadService unit tests (mocked repository, direct instantiation).

import { jest } from "@jest/globals";
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { QueryFailedError, type Repository } from "typeorm";

import {
  EstadoMunicipalidad,
  MunicipalidadEntity,
} from "./municipalidad.entity.js";
import { MunicipalidadService } from "./municipalidad.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockRepository = {
  create: AnyMock;
  save: AnyMock;
  find: AnyMock;
  findOne: AnyMock;
};

function makeMockRepository(): MockRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
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
  let service: MunicipalidadService;

  beforeEach(() => {
    repo = makeMockRepository();
    service = new MunicipalidadService(
      repo as unknown as Repository<MunicipalidadEntity>
    );
  });

  describe("create", () => {
    const dto = { nombreMunicipalidad: "Mixco", departamento: "Guatemala" };

    it("creates the municipalidad defaulting estado to ACTIVA", async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((v) => v);
      repo.save.mockImplementation(async (v) => ({ ...v, idMunicipalidad: "5" }));

      const result = await service.create(dto);

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
    });

    it("rejects a duplicate nombre with MUNICIPALIDAD_NOMBRE_DUPLICATE", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad({ idMunicipalidad: "2" }));

      const error = await service.create(dto).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("MUNICIPALIDAD_NOMBRE_DUPLICATE");
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("translates a unique violation on save into 409", async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((v) => v);
      repo.save.mockRejectedValue(uniqueViolation());

      const error = await service.create(dto).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("MUNICIPALIDAD_NOMBRE_DUPLICATE");
    });

    it("rethrows other save errors untouched", async () => {
      const boom = new Error("db down");
      repo.findOne.mockResolvedValue(null);
      repo.create.mockImplementation((v) => v);
      repo.save.mockRejectedValue(boom);

      await expect(service.create(dto)).rejects.toBe(boom);
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
    it("updates the provided fields", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad());
      repo.save.mockImplementation(async (v) => v);

      const result = await service.update("1", { departamento: "Sacatepéquez" });

      expect(result.departamento).toBe("Sacatepéquez");
      expect(result.nombreMunicipalidad).toBe("Guatemala");
    });

    it("allows keeping the same nombre without a duplicate check", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad());
      repo.save.mockImplementation(async (v) => v);

      await service.update("1", { nombreMunicipalidad: "Guatemala" });

      expect(repo.findOne).toHaveBeenCalledTimes(1);
    });

    it("rejects renaming to a nombre used by another municipalidad", async () => {
      repo.findOne
        .mockResolvedValueOnce(makeMunicipalidad())
        .mockResolvedValueOnce(
          makeMunicipalidad({ idMunicipalidad: "2", nombreMunicipalidad: "Mixco" })
        );

      const error = await service
        .update("1", { nombreMunicipalidad: "Mixco" })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("MUNICIPALIDAD_NOMBRE_DUPLICATE");
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when missing", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.update("99", { departamento: "X" })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("remove", () => {
    it("soft deletes by marking the municipalidad INACTIVA", async () => {
      repo.findOne.mockResolvedValue(makeMunicipalidad());
      repo.save.mockImplementation(async (v) => v);

      await service.remove("1");

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idMunicipalidad: "1",
          estadoMunicipalidad: EstadoMunicipalidad.INACTIVA,
        })
      );
    });

    it("throws NotFoundException when missing", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove("99")).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
