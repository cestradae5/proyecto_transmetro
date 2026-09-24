// PR#2 infraestructura-hardening — EstacionService unit tests (mocked repositories).
// EstacionService depends on two repositories: EstacionEntity (own table) and
// ParadaEntity (FK target for the optional idParada relation), validated via
// validateForeignKey() in ../shared/validators.js.

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";

import { CreateEstacionDto, EstadoEstacion } from "./dto/create-estacion.dto.js";
import { UpdateEstacionDto } from "./dto/update-estacion.dto.js";
import { EstacionEntity } from "./estacion.entity.js";
import { EstacionService } from "./estacion.service.js";
import type { ParadaEntity } from "../parada/parada.entity.js";

type MockEstacionRepository = {
  create: jest.MockedFunction<(dto: unknown) => EstacionEntity>;
  save: jest.MockedFunction<(entity: unknown) => Promise<EstacionEntity>>;
  find: jest.MockedFunction<() => Promise<EstacionEntity[]>>;
  findOne: jest.MockedFunction<(options: unknown) => Promise<EstacionEntity | null>>;
};

type MockParadaRepository = {
  count: jest.MockedFunction<(options: unknown) => Promise<number>>;
  findOne: jest.MockedFunction<(options: unknown) => Promise<ParadaEntity | null>>;
};

function makeMockEstacionRepository(): MockEstacionRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
}

function makeMockParadaRepository(): MockParadaRepository {
  return {
    count: jest.fn(),
    findOne: jest.fn(),
  };
}

function makeEstacion(overrides: Partial<EstacionEntity> = {}): EstacionEntity {
  return {
    idEstacion: "1",
    nombreEstacion: "Estación Central",
    latitud: 14.6349,
    longitud: -90.5069,
    estadoEstacion: EstadoEstacion.ACTIVA,
    idParada: undefined,
    ...overrides,
  } as EstacionEntity;
}

describe("EstacionService", () => {
  let estacionRepository: MockEstacionRepository;
  let paradaRepository: MockParadaRepository;
  let service: EstacionService;

  beforeEach(() => {
    estacionRepository = makeMockEstacionRepository();
    paradaRepository = makeMockParadaRepository();
    service = new EstacionService(
      estacionRepository as unknown as Repository<EstacionEntity>,
      paradaRepository as unknown as Repository<ParadaEntity>,
    );
  });

  describe("create", () => {
    it("persists a valid estación with no idParada without checking the FK", async () => {
      const dto: CreateEstacionDto = {
        nombreEstacion: "Estación Central",
        latitud: 14.6349,
        longitud: -90.5069,
        estadoEstacion: EstadoEstacion.ACTIVA,
      };
      const created = makeEstacion();
      estacionRepository.create.mockReturnValue(created);
      estacionRepository.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(paradaRepository.count).not.toHaveBeenCalled();
      expect(estacionRepository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        idEstacion: created.idEstacion,
        nombreEstacion: created.nombreEstacion,
        latitud: created.latitud,
        longitud: created.longitud,
        estadoEstacion: created.estadoEstacion,
        idParada: created.idParada,
      });
    });

    it("persists a valid estación when idParada references an existing parada", async () => {
      const dto: CreateEstacionDto = {
        nombreEstacion: "Estación Norte",
        latitud: 14.64,
        longitud: -90.51,
        estadoEstacion: EstadoEstacion.ACTIVA,
        idParada: "5",
      };
      const created = makeEstacion({ idParada: "5" });
      paradaRepository.count.mockResolvedValue(1);
      estacionRepository.create.mockReturnValue(created);
      estacionRepository.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(paradaRepository.count).toHaveBeenCalledWith({ where: { idParada: "5" } });
      expect(result.idParada).toBe("5");
    });

    it("throws NotFoundException when idParada does not reference an existing parada", async () => {
      const dto: CreateEstacionDto = {
        nombreEstacion: "Estación Fantasma",
        latitud: 14.64,
        longitud: -90.51,
        estadoEstacion: EstadoEstacion.ACTIVA,
        idParada: "999",
      };
      paradaRepository.count.mockResolvedValue(0);
      paradaRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(estacionRepository.create).not.toHaveBeenCalled();
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("returns the full list of estaciones mapped to response DTOs", async () => {
      const estaciones = [makeEstacion(), makeEstacion({ idEstacion: "2" })];
      estacionRepository.find.mockResolvedValue(estaciones);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({ idEstacion: "1", nombreEstacion: "Estación Central" }),
      );
    });
  });

  describe("findOne", () => {
    it("returns the estación when found", async () => {
      const estacion = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(estacion);

      const result = await service.findOne("1");

      expect(estacionRepository.findOne).toHaveBeenCalledWith({ where: { idEstacion: "1" } });
      expect(result).toEqual(
        expect.objectContaining({ idEstacion: "1", nombreEstacion: "Estación Central" }),
      );
    });

    it("throws NotFoundException when the estación does not exist", async () => {
      estacionRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
      await expect(service.findOne("missing")).rejects.toThrow(
        "Estación con ID missing no encontrada",
      );
    });
  });

  describe("update", () => {
    it("updates an existing estación without touching the FK check when idParada is absent", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(existing);
      estacionRepository.save.mockResolvedValue({
        ...existing,
        nombreEstacion: "Renombrada",
      });

      const dto: UpdateEstacionDto = { nombreEstacion: "Renombrada" };
      const result = await service.update("1", dto);

      expect(paradaRepository.count).not.toHaveBeenCalled();
      expect(result.nombreEstacion).toBe("Renombrada");
    });

    it("validates the FK when idParada is provided on update", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(existing);
      paradaRepository.count.mockResolvedValue(1);
      estacionRepository.save.mockResolvedValue({ ...existing, idParada: "5" });

      await service.update("1", { idParada: "5" });

      expect(paradaRepository.count).toHaveBeenCalledWith({ where: { idParada: "5" } });
    });

    it("throws NotFoundException when the FK target does not exist on update", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(existing);
      paradaRepository.count.mockResolvedValue(0);
      paradaRepository.findOne.mockResolvedValue(null);

      await expect(service.update("1", { idParada: "999" })).rejects.toThrow(NotFoundException);
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when updating an estación that does not exist", async () => {
      estacionRepository.findOne.mockResolvedValue(null);

      await expect(service.update("missing", { nombreEstacion: "X" })).rejects.toThrow(
        NotFoundException,
      );
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("soft-deletes by setting estadoEstacion to CERRADA", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(existing);
      estacionRepository.save.mockResolvedValue({ ...existing, estadoEstacion: "CERRADA" });

      await service.remove("1");

      expect(estacionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoEstacion: "CERRADA" }),
      );
    });

    it("throws NotFoundException when removing an estación that does not exist", async () => {
      estacionRepository.findOne.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toThrow(NotFoundException);
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });
  });
});
