// PR#3 infraestructura-hardening — LineaService unit tests (mocked repositories).
// Same pattern as parada.service.spec.ts: direct instantiation, no TestingModule.

import { jest } from "@jest/globals";
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { Repository } from "typeorm";

import { CreateLineaDto } from "./dto/create-linea.dto.js";
import { EstadoLinea, LineaEntity, TipoRecorrido } from "./linea.entity.js";
import { LineaParadaEntity } from "./linea-parada.entity.js";
import { LineaService } from "./linea.service.js";
import type { ParqueoEntity } from "../parqueo/parqueo.entity.js";
import type { ParadaEntity } from "../parada/parada.entity.js";

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

function makeLinea(overrides: Partial<LineaEntity> = {}): LineaEntity {
  return {
    idLinea: "1",
    numeroLinea: "L1",
    nombreLinea: "Línea 1",
    colorHex: "#FF5733",
    estadoLinea: EstadoLinea.ACTIVA,
    tipoRecorrido: TipoRecorrido.CIRCULAR,
    idParqueo: "10",
    parqueo: {} as ParqueoEntity,
    ...overrides,
  };
}

function makeLineaParada(
  overrides: Partial<LineaParadaEntity> = {}
): LineaParadaEntity {
  return {
    idLineaParada: "100",
    orden: 1,
    minutosHastaSiguiente: 5,
    idParada: "5",
    idLinea: "1",
    ...overrides,
  };
}

function errorCode(error: unknown): unknown {
  return ((error as HttpException).getResponse() as { error?: string }).error;
}

describe("LineaService", () => {
  let lineaRepo: MockRepository;
  let parqueoRepo: MockRepository;
  let lineaParadaRepo: MockRepository;
  let paradaRepo: MockRepository;
  let service: LineaService;

  beforeEach(() => {
    lineaRepo = makeMockRepository();
    parqueoRepo = makeMockRepository();
    lineaParadaRepo = makeMockRepository();
    paradaRepo = makeMockRepository();
    service = new LineaService(
      lineaRepo as unknown as Repository<LineaEntity>,
      parqueoRepo as unknown as Repository<ParqueoEntity>,
      lineaParadaRepo as unknown as Repository<LineaParadaEntity>,
      paradaRepo as unknown as Repository<ParadaEntity>
    );
  });

  describe("create", () => {
    const dto: CreateLineaDto = {
      numeroLinea: "L1",
      nombreLinea: "Línea 1",
      colorHex: "#FF5733",
      estadoLinea: EstadoLinea.ACTIVA as never,
      tipoRecorrido: TipoRecorrido.CIRCULAR as never,
      idParqueo: "10",
    };

    it("validates the parqueo FK and persists the línea", async () => {
      parqueoRepo.count.mockResolvedValue(1);
      const saved = makeLinea();
      lineaRepo.create.mockReturnValue(saved);
      lineaRepo.save.mockResolvedValue(saved);

      const result = await service.create(dto);

      expect(parqueoRepo.count).toHaveBeenCalledWith({
        where: { idParqueo: "10" },
      });
      expect(lineaRepo.save).toHaveBeenCalledWith(saved);
      expect(result).toEqual({
        idLinea: "1",
        numeroLinea: "L1",
        nombreLinea: "Línea 1",
        colorHex: "#FF5733",
        estadoLinea: EstadoLinea.ACTIVA,
        tipoRecorrido: TipoRecorrido.CIRCULAR,
        idParqueo: "10",
      });
    });

    it("throws NotFoundException when the parqueo does not exist", async () => {
      parqueoRepo.count.mockResolvedValue(0);
      parqueoRepo.findOne.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(lineaRepo.save).not.toHaveBeenCalled();
    });

    it("creates a línea without parqueo and skips the FK check", async () => {
      const { idParqueo: _omitted, ...withoutParqueo } = dto;
      const saved = makeLinea({ idParqueo: null });
      lineaRepo.create.mockReturnValue(saved);
      lineaRepo.save.mockResolvedValue(saved);

      const result = await service.create(withoutParqueo);

      expect(parqueoRepo.count).not.toHaveBeenCalled();
      expect(lineaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ idParqueo: null })
      );
      expect(result.idParqueo).toBeNull();
    });
  });

  describe("CreateLineaDto validation", () => {
    const base = {
      numeroLinea: "L1",
      nombreLinea: "Línea 1",
      colorHex: "#FF5733",
      estadoLinea: "ACTIVA",
      tipoRecorrido: "CIRCULAR",
    };

    it("accepts a payload without idParqueo", async () => {
      const errors = await validate(plainToInstance(CreateLineaDto, base));

      expect(errors).toHaveLength(0);
    });

    it("accepts an explicit null idParqueo", async () => {
      const errors = await validate(
        plainToInstance(CreateLineaDto, { ...base, idParqueo: null })
      );

      expect(errors).toHaveLength(0);
    });

    it("rejects an empty-string idParqueo", async () => {
      const errors = await validate(
        plainToInstance(CreateLineaDto, { ...base, idParqueo: "" })
      );

      expect(errors.map((e) => e.property)).toContain("idParqueo");
    });
  });

  describe("findAll / findOne", () => {
    it("maps every línea to its response DTO", async () => {
      lineaRepo.find.mockResolvedValue([makeLinea(), makeLinea({ idLinea: "2" })]);

      const result = await service.findAll();

      expect(result.map((l) => l.idLinea)).toEqual(["1", "2"]);
    });

    it("returns the línea when found", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());

      const result = await service.findOne("1");

      expect(lineaRepo.findOne).toHaveBeenCalledWith({ where: { idLinea: "1" } });
      expect(result.idLinea).toBe("1");
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow(
        "Línea con ID missing no encontrada"
      );
    });
  });

  describe("update", () => {
    it("updates fields without FK validation when idParqueo is absent", async () => {
      const existing = makeLinea();
      lineaRepo.findOne.mockResolvedValue(existing);
      lineaRepo.save.mockImplementation(async (l: LineaEntity) => l);

      const result = await service.update("1", { nombreLinea: "Renombrada" });

      expect(parqueoRepo.count).not.toHaveBeenCalled();
      expect(result.nombreLinea).toBe("Renombrada");
    });

    it("validates the new parqueo FK when idParqueo is provided", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      parqueoRepo.count.mockResolvedValue(0);
      parqueoRepo.findOne.mockResolvedValue(null);

      await expect(service.update("1", { idParqueo: "999" })).rejects.toThrow(
        NotFoundException
      );
      expect(lineaRepo.save).not.toHaveBeenCalled();
    });

    it("clears the parqueo without FK validation when idParqueo is null", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      lineaRepo.save.mockImplementation(async (l: LineaEntity) => l);

      const result = await service.update("1", { idParqueo: null });

      expect(parqueoRepo.count).not.toHaveBeenCalled();
      expect(result.idParqueo).toBeNull();
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(service.update("missing", {})).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("remove", () => {
    it("soft-deletes by changing estadoLinea", async () => {
      const existing = makeLinea();
      lineaRepo.findOne.mockResolvedValue(existing);
      lineaRepo.save.mockResolvedValue(existing);

      await service.remove("1");

      expect(lineaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ idLinea: "1", estadoLinea: EstadoLinea.INACTIVA })
      );
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("listParadas", () => {
    it("returns the sequence ordered by orden ascending, including parada details", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      const records = [makeLineaParada(), makeLineaParada({ idLineaParada: "101", orden: 2 })];
      lineaParadaRepo.find.mockResolvedValue(records);

      const result = await service.listParadas("1");

      expect(lineaParadaRepo.find).toHaveBeenCalledWith({
        where: { idLinea: "1" },
        relations: { parada: true },
        order: { orden: "ASC" },
      });
      expect(result).toEqual(records);
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(service.listParadas("missing")).rejects.toThrow(
        NotFoundException
      );
      expect(lineaParadaRepo.find).not.toHaveBeenCalled();
    });
  });

  describe("addParada", () => {
    const dto = { idParada: "5", orden: 1, minutosHastaSiguiente: 5 };

    it("creates the tbl_linea_parada record (happy path)", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      paradaRepo.count.mockResolvedValue(1);
      lineaParadaRepo.findOne.mockResolvedValue(null);
      const created = makeLineaParada();
      lineaParadaRepo.create.mockReturnValue(created);
      lineaParadaRepo.save.mockResolvedValue(created);

      const result = await service.addParada("1", dto);

      expect(paradaRepo.count).toHaveBeenCalledWith({ where: { idParada: "5" } });
      expect(lineaParadaRepo.create).toHaveBeenCalledWith({
        idLinea: "1",
        idParada: "5",
        orden: 1,
        minutosHastaSiguiente: 5,
      });
      expect(lineaParadaRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });

    it("allows adding to an empty línea (minimum rule only guards removal)", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      paradaRepo.count.mockResolvedValue(1);
      lineaParadaRepo.findOne.mockResolvedValue(null);
      lineaParadaRepo.create.mockReturnValue(makeLineaParada());
      lineaParadaRepo.save.mockResolvedValue(makeLineaParada());

      await expect(service.addParada("1", dto)).resolves.toBeDefined();
      expect(lineaParadaRepo.count).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(service.addParada("missing", dto)).rejects.toThrow(
        NotFoundException
      );
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      paradaRepo.count.mockResolvedValue(0);
      paradaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addParada("1", { ...dto, idParada: "999" })
      ).rejects.toThrow("Parada con ID 999 no encontrada");
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
    });

    it("rejects a duplicate orden with 409 ORDEN_DUPLICATE", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      paradaRepo.count.mockResolvedValue(1);
      lineaParadaRepo.findOne
        .mockResolvedValueOnce(null) // parada not yet on the línea
        .mockResolvedValueOnce(makeLineaParada({ idParada: "5", orden: 1 })); // orden taken

      const error = await service
        .addParada("1", { idParada: "6", orden: 1, minutosHastaSiguiente: 3 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("ORDEN_DUPLICATE");
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
    });

    it("rejects a parada already on the línea with 409", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      paradaRepo.count.mockResolvedValue(1);
      lineaParadaRepo.findOne.mockResolvedValueOnce(makeLineaParada());

      const error = await service
        .addParada("1", { idParada: "5", orden: 4, minutosHastaSiguiente: 3 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("PARADA_ALREADY_IN_LINEA");
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("updateParada", () => {
    it("updates orden and minutos when the new orden is free", async () => {
      const record = makeLineaParada();
      lineaParadaRepo.findOne
        .mockResolvedValueOnce(record) // record lookup
        .mockResolvedValueOnce(null); // orden 2 is free
      lineaParadaRepo.save.mockImplementation(async (r: LineaParadaEntity) => r);

      const result = await service.updateParada("1", "100", {
        orden: 2,
        minutosHastaSiguiente: 7,
      });

      expect(lineaParadaRepo.findOne).toHaveBeenNthCalledWith(1, {
        where: { idLineaParada: "100", idLinea: "1" },
      });
      expect(lineaParadaRepo.findOne).toHaveBeenNthCalledWith(2, {
        where: { idLinea: "1", orden: 2 },
      });
      expect(result).toEqual(
        expect.objectContaining({ orden: 2, minutosHastaSiguiente: 7 })
      );
    });

    it("updates only minutos without checking orden uniqueness", async () => {
      lineaParadaRepo.findOne.mockResolvedValueOnce(makeLineaParada());
      lineaParadaRepo.save.mockImplementation(async (r: LineaParadaEntity) => r);

      const result = await service.updateParada("1", "100", {
        minutosHastaSiguiente: 9,
      });

      expect(lineaParadaRepo.findOne).toHaveBeenCalledTimes(1);
      expect(result.minutosHastaSiguiente).toBe(9);
      expect(result.orden).toBe(1);
    });

    it("rejects an orden used by another record with 409 ORDEN_DUPLICATE", async () => {
      lineaParadaRepo.findOne
        .mockResolvedValueOnce(makeLineaParada())
        .mockResolvedValueOnce(makeLineaParada({ idLineaParada: "101", orden: 2 }));

      const error = await service
        .updateParada("1", "100", { orden: 2 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("ORDEN_DUPLICATE");
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the record belongs to another línea", async () => {
      lineaParadaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateParada("2", "100", { orden: 3 })
      ).rejects.toThrow(NotFoundException);
      expect(lineaParadaRepo.findOne).toHaveBeenCalledWith({
        where: { idLineaParada: "100", idLinea: "2" },
      });
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("removeParada", () => {
    it("deletes the record when the línea has 3 paradas", async () => {
      const record = makeLineaParada();
      lineaParadaRepo.findOne.mockResolvedValue(record);
      lineaParadaRepo.count.mockResolvedValue(3);
      lineaParadaRepo.remove.mockResolvedValue(record);

      await service.removeParada("1", "100");

      expect(lineaParadaRepo.count).toHaveBeenCalledWith({
        where: { idLinea: "1" },
      });
      expect(lineaParadaRepo.remove).toHaveBeenCalledWith(record);
    });

    it("rejects removal with 409 LINEA_MIN_PARADAS when only 2 paradas remain", async () => {
      lineaParadaRepo.findOne.mockResolvedValue(makeLineaParada());
      lineaParadaRepo.count.mockResolvedValue(2);

      const error = await service
        .removeParada("1", "100")
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("LINEA_MIN_PARADAS");
      expect(lineaParadaRepo.remove).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the record belongs to another línea", async () => {
      lineaParadaRepo.findOne.mockResolvedValue(null);

      await expect(service.removeParada("2", "100")).rejects.toThrow(
        NotFoundException
      );
      expect(lineaParadaRepo.count).not.toHaveBeenCalled();
      expect(lineaParadaRepo.remove).not.toHaveBeenCalled();
    });
  });
});
