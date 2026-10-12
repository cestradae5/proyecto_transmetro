// PR#2 infraestructura-hardening — ParadaService unit tests (mocked repository).
// Pattern mirrors authentication.service.spec.ts / authentication-foundation.spec.ts:
// no NestJS TestingModule, direct instantiation with a hand-mocked Repository.

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import { In, type Repository } from "typeorm";

import { EstacionEntity } from "../estacion/estacion.entity.js";
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

type MockEstacionRepository = {
  find: jest.MockedFunction<(options: unknown) => Promise<Partial<EstacionEntity>[]>>;
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
    idParada: 1,
    nombreParada: "Parada Central",
    latitud: 14.6349,
    longitud: -90.5069,
    estadoParada: EstadoParada.ACTIVA,
    ...overrides,
  };
}

/** Expected response: the parada plus the derived estación fields. */
function asResponse(parada: ParadaEntity, idEstacion: number | null = null) {
  return { ...parada, esEstacion: idEstacion !== null, idEstacion };
}

describe("ParadaService", () => {
  let repository: MockRepository;
  let estacionRepository: MockEstacionRepository;
  let service: ParadaService;

  beforeEach(() => {
    repository = makeMockRepository();
    estacionRepository = { find: jest.fn() };
    estacionRepository.find.mockResolvedValue([]);
    service = new ParadaService(
      repository as unknown as Repository<ParadaEntity>,
      estacionRepository as unknown as Repository<EstacionEntity>,
    );
  });

  describe("create", () => {
    it("persists a valid parada and returns it with esEstacion=false", async () => {
      const dto: CreateParadaDto = {
        nombreParada: "Parada Central",
        latitud: 14.6349,
        longitud: -90.5069,
        estadoParada: EstadoParada.ACTIVA,
      };
      const created = makeParada({ idParada: undefined as unknown as number });
      const saved = makeParada();
      repository.create.mockReturnValue(created);
      repository.save.mockResolvedValue(saved);

      const result = await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(dto);
      expect(repository.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(asResponse(saved));
      // A brand-new parada cannot have an estación: no lookup is needed.
      expect(estacionRepository.find).not.toHaveBeenCalled();
    });

    // NOTE: lat/long range validation (-90..90 / -180..180) is enforced by
    // class-validator decorators on CreateParadaDto through the global
    // ValidationPipe (see main.ts), not inside ParadaService. The service
    // itself performs no lat/long validation, so there is no service-level
    // "throws on invalid lat/long" behavior to unit test here.
  });

  describe("findAll", () => {
    it("returns the full list of paradas", async () => {
      const paradas = [makeParada(), makeParada({ idParada: 2 })];
      repository.find.mockResolvedValue(paradas);

      const result = await service.findAll();

      expect(result).toEqual(paradas.map((p) => asResponse(p)));
      expect(repository.find).toHaveBeenCalledTimes(1);
    });

    it("derives esEstacion/idEstacion with a single IN lookup (no N+1)", async () => {
      const paradas = [
        makeParada({ idParada: 1 }),
        makeParada({ idParada: 2 }),
        makeParada({ idParada: 3 }),
      ];
      repository.find.mockResolvedValue(paradas);
      // Postgres returns bigint ids as strings: the match must not depend on type.
      estacionRepository.find.mockResolvedValue([
        { idEstacion: 7, idParada: "2" as unknown as number },
      ]);

      const result = await service.findAll();

      expect(estacionRepository.find).toHaveBeenCalledTimes(1);
      expect(estacionRepository.find).toHaveBeenCalledWith({
        select: { idEstacion: true, idParada: true },
        where: { idParada: In([1, 2, 3]) },
      });
      expect(result.map((p) => [p.idParada, p.esEstacion, p.idEstacion])).toEqual([
        [1, false, null],
        [2, true, 7],
        [3, false, null],
      ]);
    });

    it("skips the estación lookup when there are no paradas", async () => {
      repository.find.mockResolvedValue([]);

      await expect(service.findAll()).resolves.toEqual([]);
      expect(estacionRepository.find).not.toHaveBeenCalled();
    });
  });

  describe("findOne", () => {
    it("returns the parada with esEstacion=false when it has no estación", async () => {
      const parada = makeParada();
      repository.findOne.mockResolvedValue(parada);

      const result = await service.findOne("1");

      // The service parses the route id to a number: id_parada is a bigint column.
      expect(repository.findOne).toHaveBeenCalledWith({ where: { idParada: 1 } });
      expect(result).toEqual(asResponse(parada));
    });

    it("returns esEstacion=true and the idEstacion when the parada is an estación", async () => {
      const parada = makeParada();
      repository.findOne.mockResolvedValue(parada);
      estacionRepository.find.mockResolvedValue([{ idEstacion: 4, idParada: 1 }]);

      const result = await service.findOne("1");

      expect(estacionRepository.find).toHaveBeenCalledWith({
        select: { idEstacion: true, idParada: true },
        where: { idParada: In([1]) },
      });
      expect(result).toEqual(asResponse(parada, 4));
      expect(result.esEstacion).toBe(true);
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
      await expect(service.findOne("missing")).rejects.toThrow(
        "Parada con ID missing no encontrada",
      );
      expect(estacionRepository.find).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("updates an existing parada and returns the refreshed response", async () => {
      const existing = makeParada();
      const updated = makeParada({ nombreParada: "Parada Renombrada" });
      repository.findOne.mockResolvedValueOnce(existing).mockResolvedValueOnce(updated);
      repository.update.mockResolvedValue({ affected: 1 });

      const dto: UpdateParadaDto = { nombreParada: "Parada Renombrada" };
      const result = await service.update("1", dto);

      // The service parses the route id to a number: id_parada is a bigint column.
      expect(repository.update).toHaveBeenCalledWith({ idParada: 1 }, dto);
      expect(result).toEqual(asResponse(updated));
    });

    it("keeps reporting the estación after an update", async () => {
      const existing = makeParada();
      repository.findOne.mockResolvedValue(existing);
      repository.update.mockResolvedValue({ affected: 1 });
      estacionRepository.find.mockResolvedValue([{ idEstacion: 9, idParada: 1 }]);

      const result = await service.update("1", { nombreParada: "X" });

      expect(result.esEstacion).toBe(true);
      expect(result.idEstacion).toBe(9);
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
