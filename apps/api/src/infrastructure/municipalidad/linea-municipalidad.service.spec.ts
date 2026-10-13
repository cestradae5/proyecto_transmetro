// LineaMunicipalidadService unit tests (mocked repositories, direct instantiation).

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
  EstadoLinea,
  TipoRecorrido,
  type LineaEntity,
} from "../linea/linea.entity.js";
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
  let audit: { record: AnyMock };
  let service: LineaMunicipalidadService;

  beforeEach(() => {
    linkRepo = makeMockRepository();
    lineaRepo = makeMockRepository();
    municipalidadRepo = makeMockRepository();
    audit = { record: jest.fn() };
    service = new LineaMunicipalidadService(
      linkRepo as unknown as Repository<LineaMunicipalidadEntity>,
      lineaRepo as unknown as Repository<LineaEntity>,
      municipalidadRepo as unknown as Repository<MunicipalidadEntity>,
      audit as unknown as InfrastructureAuditService
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

  describe("listLineas", () => {
    const linea = {
      idLinea: "3",
      numeroLinea: "L3",
      nombreLinea: "Línea 3",
      colorHex: "#00FF00",
      estadoLinea: EstadoLinea.ACTIVA,
      tipoRecorrido: TipoRecorrido.LINEAL,
      idParqueo: null,
    } as LineaEntity;

    it("returns the linked líneas with one joined query, as LineaResponseDto", async () => {
      municipalidadRepo.count.mockResolvedValue(1);
      linkRepo.find.mockResolvedValue([
        makeLink({ linea }),
        makeLink({ idLinea: "8", linea: { ...linea, idLinea: "8", numeroLinea: "L8", idParqueo: "2" } }),
      ]);

      const result = await service.listLineas("4");

      expect(municipalidadRepo.count).toHaveBeenCalledWith({
        where: { idMunicipalidad: "4" },
      });
      expect(linkRepo.find).toHaveBeenCalledTimes(1);
      expect(linkRepo.find).toHaveBeenCalledWith({
        where: { idMunicipalidad: "4" },
        relations: { linea: true },
        order: { linea: { numeroLinea: "ASC" } },
      });
      expect(lineaRepo.find).not.toHaveBeenCalled();
      expect(lineaRepo.findOne).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          idLinea: "3",
          numeroLinea: "L3",
          nombreLinea: "Línea 3",
          colorHex: "#00FF00",
          estadoLinea: "ACTIVA",
          tipoRecorrido: "LINEAL",
          idParqueo: null,
        },
        expect.objectContaining({ idLinea: "8", numeroLinea: "L8", idParqueo: "2" }),
      ]);
    });

    it("returns an empty list when the municipalidad has no líneas", async () => {
      municipalidadRepo.count.mockResolvedValue(1);
      linkRepo.find.mockResolvedValue([]);

      await expect(service.listLineas("4")).resolves.toEqual([]);
    });

    it("throws NotFoundException when the municipalidad does not exist", async () => {
      municipalidadRepo.count.mockResolvedValue(0);

      await expect(service.listLineas("99")).rejects.toThrow(
        "Municipalidad con ID 99 no encontrada"
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

      const result = await service.add("3", dto, ACTOR);

      expect(linkRepo.create).toHaveBeenCalledWith({
        idLinea: "3",
        idMunicipalidad: "4",
      });
      expect(result).toEqual({
        idLinea: "3",
        idMunicipalidad: "4",
        nombreMunicipalidad: "Villa Nueva",
      });
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.LINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_MUNICIPALIDAD,
        entityId: "3",
        detalle: { idMunicipalidad: "4" },
      });
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.count.mockResolvedValue(0);
      await expect(service.add("99", dto, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the municipalidad does not exist", async () => {
      lineaRepo.count.mockResolvedValue(1);
      municipalidadRepo.findOne.mockResolvedValue(null);
      await expect(service.add("3", dto, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("rejects a duplicate link with LINEA_MUNICIPALIDAD_DUPLICATE", async () => {
      lineaRepo.count.mockResolvedValue(1);
      municipalidadRepo.findOne.mockResolvedValue(municipalidad);
      linkRepo.findOne.mockResolvedValue(makeLink());

      const error = await service.add("3", dto, ACTOR).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("LINEA_MUNICIPALIDAD_DUPLICATE");
      expect(linkRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
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

      const error = await service.add("3", dto, ACTOR).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("LINEA_MUNICIPALIDAD_DUPLICATE");
    });
  });

  describe("remove", () => {
    it("removes the link row", async () => {
      const link = makeLink();
      linkRepo.findOne.mockResolvedValue(link);

      await service.remove("3", "4", ACTOR);

      expect(linkRepo.findOne).toHaveBeenCalledWith({
        where: { idLinea: "3", idMunicipalidad: "4" },
      });
      expect(linkRepo.remove).toHaveBeenCalledWith(link);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UNLINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_MUNICIPALIDAD,
        entityId: "3",
        detalle: { idMunicipalidad: "4" },
      });
    });

    it("throws NotFoundException when the link does not exist", async () => {
      linkRepo.findOne.mockResolvedValue(null);
      await expect(service.remove("3", "4", ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.remove).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
