// PR#2 infraestructura-hardening — ParqueoService unit tests (mocked repositories).
// ParqueoService depends only on its own repository (ParqueoEntity): since the
// infra-flow change a parqueo has no FK to estación (tbl_parqueo.id_estacion was
// dropped). Líneas reference their parqueo through the nullable tbl_linea.id_parqueo.

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";

import { CreateParqueoDto, EstadoParqueo, TipoParqueo } from "./dto/create-parqueo.dto.js";
import { UpdateParqueoDto } from "./dto/update-parqueo.dto.js";
import { ParqueoEntity } from "./parqueo.entity.js";
import { ParqueoService } from "./parqueo.service.js";

type MockParqueoRepository = {
  create: jest.MockedFunction<(dto: unknown) => ParqueoEntity>;
  save: jest.MockedFunction<(entity: unknown) => Promise<ParqueoEntity>>;
  find: jest.MockedFunction<() => Promise<ParqueoEntity[]>>;
  findOne: jest.MockedFunction<(options: unknown) => Promise<ParqueoEntity | null>>;
};

function makeMockParqueoRepository(): MockParqueoRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
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
    ...overrides,
  } as ParqueoEntity;
}

describe("ParqueoService", () => {
  let parqueoRepository: MockParqueoRepository;
  let service: ParqueoService;

  beforeEach(() => {
    parqueoRepository = makeMockParqueoRepository();
    service = new ParqueoService(
      parqueoRepository as unknown as Repository<ParqueoEntity>,
    );
  });

  describe("create", () => {
    it("persists a valid parqueo with no estación reference", async () => {
      const dto: CreateParqueoDto = {
        nombreParqueo: "Parqueo Central",
        tipoParqueo: TipoParqueo.CENTRAL,
        direccion: "1a avenida",
        latitud: 14.6349,
        longitud: -90.5069,
        capacidadUnidades: 20,
        estadoParqueo: EstadoParqueo.ACTIVO,
      };
      const created = makeParqueo();
      parqueoRepository.create.mockReturnValue(created);
      parqueoRepository.save.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(parqueoRepository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(
        expect.objectContaining({ idParqueo: "1", nombreParqueo: "Parqueo Central" }),
      );
      expect(result).not.toHaveProperty("idEstacion");
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
    it("updates an existing parqueo", async () => {
      const existing = makeParqueo();
      parqueoRepository.findOne.mockResolvedValue(existing);
      parqueoRepository.save.mockResolvedValue({
        ...existing,
        nombreParqueo: "Renombrado",
      });

      const dto: UpdateParqueoDto = { nombreParqueo: "Renombrado" };
      const result = await service.update("1", dto);

      expect(result.nombreParqueo).toBe("Renombrado");
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
