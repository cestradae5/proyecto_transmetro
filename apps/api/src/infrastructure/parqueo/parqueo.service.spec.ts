// PR#2 infraestructura-hardening — ParqueoService unit tests (mocked repositories).
// ParqueoService depends on two repositories: ParqueoEntity (own table) and
// EstacionEntity (FK target for the required idEstacion relation), validated
// via validateForeignKey() in ../shared/validators.js. Unlike Estacion→Parada,
// idEstacion is mandatory on create (no "skip FK check" branch).

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";

import { CreateParqueoDto, EstadoParqueo, TipoParqueo } from "./dto/create-parqueo.dto.js";
import { UpdateParqueoDto } from "./dto/update-parqueo.dto.js";
import { ParqueoEntity } from "./parqueo.entity.js";
import { ParqueoService } from "./parqueo.service.js";
import type { EstacionEntity } from "../estacion/estacion.entity.js";

type MockParqueoRepository = {
  create: jest.MockedFunction<(dto: unknown) => ParqueoEntity>;
  save: jest.MockedFunction<(entity: unknown) => Promise<ParqueoEntity>>;
  find: jest.MockedFunction<() => Promise<ParqueoEntity[]>>;
  findOne: jest.MockedFunction<(options: unknown) => Promise<ParqueoEntity | null>>;
};

type MockEstacionRepository = {
  count: jest.MockedFunction<(options: unknown) => Promise<number>>;
  findOne: jest.MockedFunction<(options: unknown) => Promise<EstacionEntity | null>>;
};

function makeMockParqueoRepository(): MockParqueoRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
}

function makeMockEstacionRepository(): MockEstacionRepository {
  return {
    count: jest.fn(),
    findOne: jest.fn(),
  };
}

function makeParqueo(overrides: Partial<ParqueoEntity> = {}): ParqueoEntity {
  return {
    idParqueo: "1",
    nombreParqueo: "Parqueo Central",
    tipoParqueo: TipoParqueo.CENTRAL,
    direccion: "1a avenida",
    latitud: 14.6349,
    longitud: -90.5069,
    capacidadUnidades: 20,
    estadoParqueo: EstadoParqueo.ACTIVO,
    idEstacion: "1",
    ...overrides,
  } as ParqueoEntity;
}

describe("ParqueoService", () => {
  let parqueoRepository: MockParqueoRepository;
  let estacionRepository: MockEstacionRepository;
  let service: ParqueoService;

  beforeEach(() => {
    parqueoRepository = makeMockParqueoRepository();
    estacionRepository = makeMockEstacionRepository();
    service = new ParqueoService(
      parqueoRepository as unknown as Repository<ParqueoEntity>,
      estacionRepository as unknown as Repository<EstacionEntity>,
    );
  });

  describe("create", () => {
    it("persists a valid parqueo when idEstacion references an existing estación", async () => {
      const dto: CreateParqueoDto = {
        nombreParqueo: "Parqueo Central",
        tipoParqueo: TipoParqueo.CENTRAL,
        direccion: "1a avenida",
        latitud: 14.6349,
        longitud: -90.5069,
        capacidadUnidades: 20,
        estadoParqueo: EstadoParqueo.ACTIVO,
        idEstacion: "1",
      };
      const created = makeParqueo();
      estacionRepository.count.mockResolvedValue(1);
      parqueoRepository.create.mockReturnValue(created);
      parqueoRepository.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(estacionRepository.count).toHaveBeenCalledWith({ where: { idEstacion: "1" } });
      expect(parqueoRepository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(
        expect.objectContaining({ idParqueo: "1", nombreParqueo: "Parqueo Central" }),
      );
    });

    it("throws NotFoundException when idEstacion does not reference an existing estación", async () => {
      const dto: CreateParqueoDto = {
        nombreParqueo: "Parqueo Fantasma",
        tipoParqueo: TipoParqueo.AUXILIAR,
        direccion: "Zona 0",
        latitud: 14.6,
        longitud: -90.5,
        capacidadUnidades: 5,
        estadoParqueo: EstadoParqueo.ACTIVO,
        idEstacion: "999",
      };
      estacionRepository.count.mockResolvedValue(0);
      estacionRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(parqueoRepository.create).not.toHaveBeenCalled();
      expect(parqueoRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("returns the full list of parqueos mapped to response DTOs", async () => {
      const parqueos = [makeParqueo(), makeParqueo({ idParqueo: "2" })];
      parqueoRepository.find.mockResolvedValue(parqueos);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({ idParqueo: "1", nombreParqueo: "Parqueo Central" }),
      );
    });
  });

  describe("findOne", () => {
    it("returns the parqueo when found", async () => {
      const parqueo = makeParqueo();
      parqueoRepository.findOne.mockResolvedValue(parqueo);

      const result = await service.findOne("1");

      expect(parqueoRepository.findOne).toHaveBeenCalledWith({ where: { idParqueo: "1" } });
      expect(result).toEqual(
        expect.objectContaining({ idParqueo: "1", nombreParqueo: "Parqueo Central" }),
      );
    });

    it("throws NotFoundException when the parqueo does not exist", async () => {
      parqueoRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
      await expect(service.findOne("missing")).rejects.toThrow(
        "Parqueo con ID missing no encontrado",
      );
    });
  });

  describe("update", () => {
    it("updates an existing parqueo without checking the FK when idEstacion is absent", async () => {
      const existing = makeParqueo();
      parqueoRepository.findOne.mockResolvedValue(existing);
      parqueoRepository.save.mockResolvedValue({
        ...existing,
        nombreParqueo: "Renombrado",
      });

      const dto: UpdateParqueoDto = { nombreParqueo: "Renombrado" };
      const result = await service.update("1", dto);

      expect(estacionRepository.count).not.toHaveBeenCalled();
      expect(result.nombreParqueo).toBe("Renombrado");
    });

    it("validates the FK when idEstacion is provided on update", async () => {
      const existing = makeParqueo();
      parqueoRepository.findOne.mockResolvedValue(existing);
      estacionRepository.count.mockResolvedValue(1);
      parqueoRepository.save.mockResolvedValue({ ...existing, idEstacion: "2" });

      await service.update("1", { idEstacion: "2" });

      expect(estacionRepository.count).toHaveBeenCalledWith({ where: { idEstacion: "2" } });
    });

    it("throws NotFoundException when the FK target does not exist on update", async () => {
      const existing = makeParqueo();
      parqueoRepository.findOne.mockResolvedValue(existing);
      estacionRepository.count.mockResolvedValue(0);
      estacionRepository.findOne.mockResolvedValue(null);

      await expect(service.update("1", { idEstacion: "999" })).rejects.toThrow(
        NotFoundException,
      );
      expect(parqueoRepository.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when updating a parqueo that does not exist", async () => {
      parqueoRepository.findOne.mockResolvedValue(null);

      await expect(service.update("missing", { nombreParqueo: "X" })).rejects.toThrow(
        NotFoundException,
      );
      expect(parqueoRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("soft-deletes by setting estadoParqueo to CERRADO", async () => {
      const existing = makeParqueo();
      parqueoRepository.findOne.mockResolvedValue(existing);
      parqueoRepository.save.mockResolvedValue({ ...existing, estadoParqueo: "CERRADO" as any });

      await service.remove("1");

      expect(parqueoRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoParqueo: "CERRADO" }),
      );
    });

    it("throws NotFoundException when removing a parqueo that does not exist", async () => {
      parqueoRepository.findOne.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toThrow(NotFoundException);
      expect(parqueoRepository.save).not.toHaveBeenCalled();
    });
  });
});
