// PR#2 infraestructura-hardening — ParqueoService unit tests (mocked repositories).
// ParqueoService depends only on its own repository (ParqueoEntity): since the
// infra-flow change a parqueo has no FK to estación (tbl_parqueo.id_estacion was
// dropped). Líneas reference their parqueo through the nullable tbl_linea.id_parqueo.

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { EntityManager, Repository } from "typeorm";

import type { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";
import { CreateParqueoDto, EstadoParqueo, TipoParqueo } from "./dto/create-parqueo.dto.js";
import { UpdateParqueoDto } from "./dto/update-parqueo.dto.js";
import { ParqueoEntity } from "./parqueo.entity.js";
import { ParqueoService } from "./parqueo.service.js";

const ACTOR = "7";

type MockParqueoRepository = {
  create: jest.MockedFunction<(dto: unknown) => ParqueoEntity>;
  save: jest.MockedFunction<(entity: unknown) => Promise<ParqueoEntity>>;
  find: jest.MockedFunction<() => Promise<ParqueoEntity[]>>;
  findOne: jest.MockedFunction<(options: unknown) => Promise<ParqueoEntity | null>>;
  manager: { transaction: jest.MockedFunction<(cb: (m: EntityManager) => unknown) => Promise<unknown>> };
};

function makeMockParqueoRepository(): MockParqueoRepository {
  const repo: MockParqueoRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const manager = { getRepository: () => repo } as unknown as EntityManager;
  repo.manager.transaction.mockImplementation(
    async (cb: (m: EntityManager) => unknown) => cb(manager)
  );
  return repo;
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
  let audit: { record: jest.MockedFunction<(...args: any[]) => any> };
  let service: ParqueoService;

  beforeEach(() => {
    parqueoRepository = makeMockParqueoRepository();
    audit = { record: jest.fn() };
    service = new ParqueoService(
      parqueoRepository as unknown as Repository<ParqueoEntity>,
      audit as unknown as InfrastructureAuditService,
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

      const result = await service.create(dto, ACTOR);

      expect(parqueoRepository.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(
        expect.objectContaining({ idParqueo: "1", nombreParqueo: "Parqueo Central" }),
      );
      expect(result).not.toHaveProperty("idEstacion");
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.PARQUEO,
        entityId: "1",
        detalle: {
          nombreParqueo: "Parqueo Central",
          tipoParqueo: TipoParqueo.CENTRAL,
          estadoParqueo: EstadoParqueo.ACTIVO,
        },
      });
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
      const result = await service.update("1", dto, ACTOR);

      expect(result.nombreParqueo).toBe("Renombrado");
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.PARQUEO,
        entityId: "1",
        detalle: { changedFields: ["nombreParqueo"] },
      });
    });

    it("throws NotFoundException when updating a parqueo that does not exist", async () => {
      parqueoRepository.findOne.mockResolvedValue(null);

      await expect(service.update("missing", { nombreParqueo: "X" }, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
      expect(parqueoRepository.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("soft-deletes by setting estadoParqueo to CERRADO", async () => {
      const existing = makeParqueo();
      parqueoRepository.findOne.mockResolvedValue(existing);
      parqueoRepository.save.mockResolvedValue({ ...existing, estadoParqueo: "CERRADO" as any });

      await service.remove("1", ACTOR);

      expect(parqueoRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoParqueo: "CERRADO" }),
      );
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.PARQUEO,
        entityId: "1",
        detalle: { nombreParqueo: "Parqueo Central" },
      });
    });

    it("throws NotFoundException when removing a parqueo that does not exist", async () => {
      parqueoRepository.findOne.mockResolvedValue(null);

      await expect(service.remove("missing", ACTOR)).rejects.toThrow(NotFoundException);
      expect(parqueoRepository.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
