// EstacionLineaService unit tests (mocked repositories, direct instantiation).

import { jest } from "@jest/globals";
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import type { Repository } from "typeorm";

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
  let service: EstacionLineaService;

  beforeEach(() => {
    linkRepo = makeMockRepository();
    estacionRepo = makeMockRepository();
    lineaRepo = makeMockRepository();
    service = new EstacionLineaService(
      linkRepo as unknown as Repository<EstacionLineaEntity>,
      estacionRepo as unknown as Repository<EstacionEntity>,
      lineaRepo as unknown as Repository<LineaEntity>
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

      const result = await service.add("7", dto);

      expect(linkRepo.create).toHaveBeenCalledWith({
        idEstacion: "7",
        idLinea: "3",
        tipoPunto: TipoPunto.CONTROL,
        estadoAsignacion: EstadoAsignacionLinea.ACTIVA,
      });
      expect(result.estadoAsignacion).toBe(EstadoAsignacionLinea.ACTIVA);
    });

    it("respects an explicit estadoAsignacion", async () => {
      estacionRepo.count.mockResolvedValue(1);
      lineaRepo.count.mockResolvedValue(1);
      linkRepo.findOne.mockResolvedValue(null);
      linkRepo.create.mockImplementation((v) => v);
      linkRepo.save.mockImplementation(async (v) => v);

      const result = await service.add("7", {
        ...dto,
        estadoAsignacion: EstadoAsignacionLinea.INACTIVA,
      });

      expect(result.estadoAsignacion).toBe(EstadoAsignacionLinea.INACTIVA);
    });

    it("throws NotFoundException when the station does not exist", async () => {
      estacionRepo.count.mockResolvedValue(0);
      await expect(service.add("99", dto)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the line does not exist", async () => {
      estacionRepo.count.mockResolvedValue(1);
      lineaRepo.count.mockResolvedValue(0);
      await expect(service.add("7", dto)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.save).not.toHaveBeenCalled();
    });

    it("rejects a duplicate link with ESTACION_LINEA_DUPLICATE", async () => {
      estacionRepo.count.mockResolvedValue(1);
      lineaRepo.count.mockResolvedValue(1);
      linkRepo.findOne.mockResolvedValue(makeLink());

      const error = await service.add("7", dto).catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("ESTACION_LINEA_DUPLICATE");
      expect(linkRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("updates only the provided fields", async () => {
      const link = makeLink();
      linkRepo.findOne.mockResolvedValue(link);
      linkRepo.save.mockImplementation(async (v) => v);

      const result = await service.update("7", "3", {
        estadoAsignacion: EstadoAsignacionLinea.INACTIVA,
      });

      expect(result.estadoAsignacion).toBe(EstadoAsignacionLinea.INACTIVA);
      expect(result.tipoPunto).toBe(TipoPunto.PRINCIPAL);
    });

    it("throws NotFoundException when the link does not exist", async () => {
      linkRepo.findOne.mockResolvedValue(null);
      await expect(
        service.update("7", "3", { tipoPunto: TipoPunto.APOYO })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("remove", () => {
    it("removes the link row", async () => {
      const link = makeLink();
      linkRepo.findOne.mockResolvedValue(link);

      await service.remove("7", "3");

      expect(linkRepo.remove).toHaveBeenCalledWith(link);
    });

    it("throws NotFoundException when the link does not exist", async () => {
      linkRepo.findOne.mockResolvedValue(null);
      await expect(service.remove("7", "3")).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(linkRepo.remove).not.toHaveBeenCalled();
    });
  });
});
