// LineaMunicipalidadService unit tests (mocked repositories, direct instantiation).

import { jest } from "@jest/globals";
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { QueryFailedError, type Repository } from "typeorm";

import type { LineaEntity } from "../linea/linea.entity.js";
import type { LineaMunicipalidadEntity } from "./linea-municipalidad.entity.js";
import { LineaMunicipalidadService } from "./linea-municipalidad.service.js";
import {
  EstadoMunicipalidad,
  type MunicipalidadEntity,
} from "./municipalidad.entity.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockRepository = {
  create: AnyMock;
  save: AnyMock;
  find: AnyMock;
  findOne: AnyMock;
  count: AnyMock;
  remove: AnyMock;
};

function makeMockRepository(): MockRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
  };
}

const municipalidad: MunicipalidadEntity = {
  idMunicipalidad: "4",
  nombreMunicipalidad: "Villa Nueva",
  departamento: "Guatemala",
  estadoMunicipalidad: EstadoMunicipalidad.ACTIVA,
};

function makeLink(
  overrides: Partial<LineaMunicipalidadEntity> = {}
): LineaMunicipalidadEntity {
  return { idLinea: "3", idMunicipalidad: "4", municipalidad, ...overrides };
}

function errorCode(error: unknown): unknown {
  return ((error as HttpException).getResponse() as { error?: string }).error;
}

describe("LineaMunicipalidadService", () => {
  let linkRepo: MockRepository;
  let lineaRepo: MockRepository;
  let municipalidadRepo: MockRepository;
  let service: LineaMunicipalidadService;

  beforeEach(() => {
    linkRepo = makeMockRepository();
    lineaRepo = makeMockRepository();
    municipalidadRepo = makeMockRepository();
    service = new LineaMunicipalidadService(
      linkRepo as unknown as Repository<LineaMunicipalidadEntity>,
      lineaRepo as unknown as Repository<LineaEntity>,
      municipalidadRepo as unknown as Repository<MunicipalidadEntity>
    );
  });

  describe("list", () => {
    it("returns the links with the municipalidad name", async () => {
      lineaRepo.count.mockResolvedValue(1);
      linkRepo.find.mockResolvedValue([makeLink()]);

      await expect(service.list("3")).resolves.toEqual([
        { idLinea: "3", idMunicipalidad: "4", nombreMunicipalidad: "Villa Nueva" },
      ]);
      expect(linkRepo.find).toHaveBeenCalledWith({
        where: { idLinea: "3" },
        relations: { municipalidad: true },
      });
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.count.mockResolvedValue(0);
      await expect(service.list("99")).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.find).not.toHaveBeenCalled();
    });
  });

  describe("add", () => {
    const dto = { idMunicipalidad: "4" };

    it("creates the link and returns the municipalidad name", async () => {
      lineaRepo.count.mockResolvedValue(1);
      municipalidadRepo.findOne.mockResolvedValue(municipalidad);
      linkRepo.findOne.mockResolvedValue(null);
      linkRepo.create.mockImplementation((v) => v);
      linkRepo.save.mockImplementation(async (v) => v);

      const result = await service.add("3", dto);

      expect(linkRepo.create).toHaveBeenCalledWith({
        idLinea: "3",
        idMunicipalidad: "4",
      });
      expect(result).toEqual({
        idLinea: "3",
        idMunicipalidad: "4",
        nombreMunicipalidad: "Villa Nueva",
      });
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.count.mockResolvedValue(0);
      await expect(service.add("99", dto)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the municipalidad does not exist", async () => {
      lineaRepo.count.mockResolvedValue(1);
      municipalidadRepo.findOne.mockResolvedValue(null);
      await expect(service.add("3", dto)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.save).not.toHaveBeenCalled();
    });

    it("rejects a duplicate link with LINEA_MUNICIPALIDAD_DUPLICATE", async () => {
      lineaRepo.count.mockResolvedValue(1);
      municipalidadRepo.findOne.mockResolvedValue(municipalidad);
      linkRepo.findOne.mockResolvedValue(makeLink());

      const error = await service.add("3", dto).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("LINEA_MUNICIPALIDAD_DUPLICATE");
      expect(linkRepo.save).not.toHaveBeenCalled();
    });

    it("translates a concurrent PK violation into 409", async () => {
      lineaRepo.count.mockResolvedValue(1);
      municipalidadRepo.findOne.mockResolvedValue(municipalidad);
      linkRepo.findOne.mockResolvedValue(null);
      linkRepo.create.mockImplementation((v) => v);
      linkRepo.save.mockRejectedValue(
        new QueryFailedError(
          "query",
          [],
          Object.assign(new Error("pg"), { code: "23505" })
        )
      );

      const error = await service.add("3", dto).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("LINEA_MUNICIPALIDAD_DUPLICATE");
    });
  });

  describe("remove", () => {
    it("removes the link row", async () => {
      const link = makeLink();
      linkRepo.findOne.mockResolvedValue(link);

      await service.remove("3", "4");

      expect(linkRepo.findOne).toHaveBeenCalledWith({
        where: { idLinea: "3", idMunicipalidad: "4" },
      });
      expect(linkRepo.remove).toHaveBeenCalledWith(link);
    });

    it("throws NotFoundException when the link does not exist", async () => {
      linkRepo.findOne.mockResolvedValue(null);
      await expect(service.remove("3", "4")).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.remove).not.toHaveBeenCalled();
    });
  });
});
