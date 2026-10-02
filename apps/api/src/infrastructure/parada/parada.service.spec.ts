// PR#2 infraestructura-hardening — ParadaService unit tests (mocked repository).
// Pattern mirrors authentication.service.spec.ts / authentication-foundation.spec.ts:
// no NestJS TestingModule, direct instantiation with a hand-mocked Repository.

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";

import { CreateParadaDto } from "./dto/create-parada.dto.js";
import { UpdateParadaDto } from "./dto/update-parada.dto.js";
import { EstadoParada, ParadaEntity } from "./parada.entity.js";
import { ParadaService } from "./parada.service.js";

type MockRepository = {
  create: jest.MockedFunction<(dto: unknown) => ParadaEntity>;
  save: jest.MockedFunction<(entity: unknown) => Promise<ParadaEntity>>;
  find: jest.MockedFunction<() => Promise<ParadaEntity[]>>;
  findOne: jest.MockedFunction<(options: unknown) => Promise<ParadaEntity | null>>;
  update: jest.MockedFunction<(criteria: unknown, partial: unknown) => Promise<unknown>>;
  remove: jest.MockedFunction<(entity: ParadaEntity) => Promise<ParadaEntity>>;
};

function makeMockRepository(): MockRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function makeParada(overrides: Partial<ParadaEntity> = {}): ParadaEntity {
  return {
    idParada: "1",
    nombreParada: "Parada Central",
    latitud: 14.6349,
    longitud: -90.5069,
    estadoParada: EstadoParada.ACTIVA,
    ...overrides,
  };
}

describe("ParadaService", () => {
  let repository: MockRepository;
  let service: ParadaService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new ParadaService(repository as unknown as Repository<ParadaEntity>);
  });

  describe("create", () => {
    it("persists a valid parada and returns the saved entity", async () => {
      const dto: CreateParadaDto = {
        nombreParada: "Parada Central",
        latitud: 14.6349,
        longitud: -90.5069,
        estadoParada: EstadoParada.ACTIVA,
      };
      const created = makeParada({ idParada: undefined as unknown as string });
      const saved = makeParada();
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(saved);

      const result = await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(dto);
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(saved);
    });

    // NOTE: lat/long range validation (-90..90 / -180..180) is enforced by
    // class-validator decorators on CreateParadaDto through the global
    // ValidationPipe (see main.ts), not inside ParadaService. The service
    // itself performs no lat/long validation, so there is no service-level
    // "throws on invalid lat/long" behavior to unit test here.
  });

  describe("findAll", () => {
    it("returns the full list of paradas", async () => {
      const paradas = [makeParada(), makeParada({ idParada: "2" })];
      repository.find.mockResolvedValue(paradas);

      const result = await service.findAll();

      expect(result).toEqual(paradas);
      expect(repository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe("findOne", () => {
    it("returns the parada when found", async () => {
      const parada = makeParada();
      repository.findOne.mockResolvedValue(parada);

      const result = await service.findOne("1");

      // The service parses the route id to a number: id_parada is a bigint column.
      expect(repository.findOne).toHaveBeenCalledWith({ where: { idParada: 1 } });
      expect(result).toEqual(parada);
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
      await expect(service.findOne("missing")).rejects.toThrow(
        "Parada con ID missing no encontrada",
      );
    });
  });

  describe("update", () => {
    it("updates an existing parada and returns the refreshed entity", async () => {
      const existing = makeParada();
      const updated = makeParada({ nombreParada: "Parada Renombrada" });
      repository.findOne.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
      repository.update.mockResolvedValue({ affected: 1 });

      const dto: UpdateParadaDto = { nombreParada: "Parada Renombrada" };
      const result = await service.update("1", dto);

      // The service parses the route id to a number: id_parada is a bigint column.
      expect(repository.update).toHaveBeenCalledWith({ idParada: 1 }, dto);
      expect(result).toEqual(updated);
    });

    it("throws NotFoundException when updating a parada that does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update("missing", { nombreParada: "X" })).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("soft-deletes by setting estadoParada to CERRADA when force is false", async () => {
      const existing = makeParada();
      repository.findOne.mockResolvedValue(existing);
      repository.save.mockResolvedValue(existing);

      await service.remove("1");

      // Soft delete mutates the loaded entity and persists it with save(); it
      // deliberately does not go through update() or remove().
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoParada: EstadoParada.CERRADA }),
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it("hard-deletes via repository.remove when force is true", async () => {
      const existing = makeParada();
      repository.findOne.mockResolvedValue(existing);
      repository.remove.mockResolvedValue(existing);

      await service.remove("1", true);

      expect(repository.remove).toHaveBeenCalledWith(existing);
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when removing a parada that does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
