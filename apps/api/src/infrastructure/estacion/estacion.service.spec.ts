// PR#2 infraestructura-hardening — EstacionService unit tests (mocked repositories).
// EstacionService depends on two repositories: EstacionEntity (own table) and
// ParadaEntity (FK target for the required idParada relation), validated via
// validateForeignKey() in ../shared/validators.js. An estación is a 1:1
// extension of a parada (tbl_estacion.id_parada NOT NULL UNIQUE).

import { jest } from "@jest/globals";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { QueryFailedError, type Repository } from "typeorm";

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
  remove: jest.MockedFunction<(entity: unknown) => Promise<EstacionEntity>>;
};

/** Builds the error TypeORM raises when Postgres rejects a statement. */
function pgError(code: string): QueryFailedError {
  return new QueryFailedError("DELETE", [], Object.assign(new Error("pg"), { code }));
}

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
    remove: jest.fn(),
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
    idParada: 3,
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
    it("persists a valid estación when idParada references a parada without estación", async () => {
      const dto: CreateEstacionDto = {
        nombreEstacion: "Estación Norte",
        latitud: 14.64,
        longitud: -90.51,
        estadoEstacion: EstadoEstacion.ACTIVA,
        idParada: 5,
      };
      const created = makeEstacion({ idParada: 5 });
      paradaRepository.count.mockResolvedValue(1);
      estacionRepository.findOne.mockResolvedValue(null);
      estacionRepository.create.mockReturnValue(created);
      estacionRepository.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(paradaRepository.count).toHaveBeenCalledWith({ where: { idParada: 5 } });
      expect(estacionRepository.findOne).toHaveBeenCalledWith({ where: { idParada: 5 } });
      expect(estacionRepository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        idEstacion: created.idEstacion,
        nombreEstacion: created.nombreEstacion,
        latitud: created.latitud,
        longitud: created.longitud,
        estadoEstacion: created.estadoEstacion,
        idParada: 5,
      });
    });

    it("throws NotFoundException when idParada does not reference an existing parada", async () => {
      const dto: CreateEstacionDto = {
        nombreEstacion: "Estación Fantasma",
        latitud: 14.64,
        longitud: -90.51,
        estadoEstacion: EstadoEstacion.ACTIVA,
        idParada: 999,
      };
      paradaRepository.count.mockResolvedValue(0);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
      expect(estacionRepository.create).not.toHaveBeenCalled();
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });

    it("throws ConflictException when the parada already has an estación", async () => {
      const dto: CreateEstacionDto = {
        nombreEstacion: "Estación Duplicada",
        latitud: 14.64,
        longitud: -90.51,
        estadoEstacion: EstadoEstacion.ACTIVA,
        idParada: 5,
      };
      paradaRepository.count.mockResolvedValue(1);
      estacionRepository.findOne.mockResolvedValue(makeEstacion({ idParada: 5 }));

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe("CreateEstacionDto validation", () => {
    const base = {
      nombreEstacion: "Estación Norte",
      latitud: 14.64,
      longitud: -90.51,
      estadoEstacion: EstadoEstacion.ACTIVA,
    };

    it("rejects a payload without idParada", async () => {
      const errors = await validate(plainToInstance(CreateEstacionDto, base));

      expect(errors.map((e) => e.property)).toContain("idParada");
    });

    it("accepts a payload with a numeric idParada", async () => {
      const errors = await validate(
        plainToInstance(CreateEstacionDto, { ...base, idParada: 5 }),
      );

      expect(errors).toHaveLength(0);
    });
  });

  describe("findAll", () => {
    it("returns the full list of estaciones mapped to response DTOs", async () => {
      const estaciones = [makeEstacion(), makeEstacion({ idEstacion: 2 })];
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

      // The service parses the route id to a number: id_estacion is a bigint column.
      expect(estacionRepository.findOne).toHaveBeenCalledWith({ where: { idEstacion: 1 } });
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

    it("validates the FK and uniqueness when idParada changes on update", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(null);
      paradaRepository.count.mockResolvedValue(1);
      estacionRepository.save.mockResolvedValue({ ...existing, idParada: 5 });

      await service.update("1", { idParada: 5 });

      expect(paradaRepository.count).toHaveBeenCalledWith({ where: { idParada: 5 } });
      expect(estacionRepository.findOne).toHaveBeenLastCalledWith({ where: { idParada: 5 } });
    });

    it("skips the FK check when idParada is unchanged", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(existing);
      estacionRepository.save.mockResolvedValue(existing);

      await service.update("1", { idParada: existing.idParada });

      expect(paradaRepository.count).not.toHaveBeenCalled();
    });

    it("throws ConflictException when the new parada already has an estación", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(makeEstacion({ idEstacion: 2, idParada: 7 }));
      paradaRepository.count.mockResolvedValue(1);

      await expect(service.update("1", { idParada: 7 })).rejects.toThrow(ConflictException);
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when idParada is cleared to null", async () => {
      estacionRepository.findOne.mockResolvedValue(makeEstacion());

      await expect(
        service.update("1", { idParada: null as unknown as number }),
      ).rejects.toThrow(BadRequestException);
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the FK target does not exist on update", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(existing);
      paradaRepository.count.mockResolvedValue(0);

      await expect(service.update("1", { idParada: 999 })).rejects.toThrow(NotFoundException);
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

    it("keeps the soft delete when force is false", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(existing);
      estacionRepository.save.mockResolvedValue(existing);

      await service.remove("1", false);

      expect(estacionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoEstacion: "CERRADA" }),
      );
      expect(estacionRepository.remove).not.toHaveBeenCalled();
    });

    it("hard-deletes via repository.remove when force is true", async () => {
      const existing = makeEstacion();
      estacionRepository.findOne.mockResolvedValue(existing);
      estacionRepository.remove.mockResolvedValue(existing);

      await service.remove("1", true);

      expect(estacionRepository.findOne).toHaveBeenCalledWith({ where: { idEstacion: 1 } });
      expect(estacionRepository.remove).toHaveBeenCalledWith(existing);
      expect(estacionRepository.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException on force delete of a missing estación", async () => {
      estacionRepository.findOne.mockResolvedValue(null);

      await expect(service.remove("missing", true)).rejects.toThrow(NotFoundException);
      expect(estacionRepository.remove).not.toHaveBeenCalled();
    });

    it("translates a foreign key violation (23503) into 409 ESTACION_IN_USE", async () => {
      estacionRepository.findOne.mockResolvedValue(makeEstacion());
      estacionRepository.remove.mockRejectedValue(pgError("23503"));

      const error = await service.remove("1", true).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      const body = (error as ConflictException).getResponse() as Record<string, unknown>;
      expect(body).toEqual(
        expect.objectContaining({ statusCode: 409, error: "ESTACION_IN_USE" }),
      );
      expect(body.message).toContain("asignaciones o vínculos");
    });

    it("rethrows other database errors unchanged on force delete", async () => {
      estacionRepository.findOne.mockResolvedValue(makeEstacion());
      const other = pgError("23505");
      estacionRepository.remove.mockRejectedValue(other);

      await expect(service.remove("1", true)).rejects.toBe(other);
    });
  });
});
