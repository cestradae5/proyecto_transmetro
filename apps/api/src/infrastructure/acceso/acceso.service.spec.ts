// AccesoService unit tests (mocked repositories, direct instantiation).

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { EntityManager, Repository } from "typeorm";

import { ParadaEntity } from "../parada/parada.entity.js";
import type { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";
import { AccesoEntity, EstadoAcceso, TipoAcceso } from "./acceso.entity.js";
import { AccesoService } from "./acceso.service.js";

const ACTOR = "7";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockAccesoRepository = {
  create: AnyMock;
  save: AnyMock;
  find: AnyMock;
  findOne: AnyMock;
  manager: { transaction: AnyMock };
};

type MockParadaRepository = {
  count: AnyMock;
};

function makeAcceso(overrides: Partial<AccesoEntity> = {}): AccesoEntity {
  return {
    idAcceso: "10",
    idParada: "1",
    nombreAcceso: "Acceso norte",
    latitud: 14.6349,
    longitud: -90.5069,
    tipoAcceso: TipoAcceso.PEATONAL,
    estadoAcceso: EstadoAcceso.HABILITADO,
    ...overrides,
  };
}

describe("AccesoService", () => {
  let accesoRepo: MockAccesoRepository;
  let paradaRepo: MockParadaRepository;
  let audit: { record: AnyMock };
  let service: AccesoService;

  beforeEach(() => {
    accesoRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      manager: { transaction: jest.fn() },
    };
    const manager = {
      getRepository: () => accesoRepo,
    } as unknown as EntityManager;
    accesoRepo.manager.transaction.mockImplementation(
      async (cb: (m: EntityManager) => unknown) => cb(manager)
    );
    // validateForeignKey counts the parada; 1 = exists by default.
    paradaRepo = { count: jest.fn() };
    paradaRepo.count.mockResolvedValue(1);
    audit = { record: jest.fn() };
    service = new AccesoService(
      accesoRepo as unknown as Repository<AccesoEntity>,
      paradaRepo as unknown as Repository<ParadaEntity>,
      audit as unknown as InfrastructureAuditService
    );
  });

  function paradaMissing(): void {
    paradaRepo.count.mockResolvedValue(0);
  }

  describe("list", () => {
    it("returns the parada's accesos ordered by nombre", async () => {
      accesoRepo.find.mockResolvedValue([makeAcceso()]);

      const result = await service.list("1");

      expect(paradaRepo.count).toHaveBeenCalledWith({ where: { idParada: "1" } });
      expect(accesoRepo.find).toHaveBeenCalledWith({
        where: { idParada: "1" },
        order: { nombreAcceso: "ASC" },
      });
      expect(result).toEqual([makeAcceso()]);
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      paradaMissing();

      await expect(service.list("99")).rejects.toThrow(
        "Parada con ID 99 no encontrada"
      );
      expect(accesoRepo.find).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    const dto = {
      nombreAcceso: "Acceso norte",
      latitud: 14.6349,
      longitud: -90.5069,
      tipoAcceso: TipoAcceso.RAMPA,
    };

    it("creates the acceso under the route parada defaulting estado to HABILITADO", async () => {
      accesoRepo.create.mockImplementation((v) => v);
      accesoRepo.save.mockImplementation(async (v) => ({ ...v, idAcceso: "11" }));

      const result = await service.create("1", dto, ACTOR);

      expect(accesoRepo.create).toHaveBeenCalledWith({
        ...dto,
        idParada: "1",
        estadoAcceso: EstadoAcceso.HABILITADO,
      });
      expect(result).toEqual({
        idAcceso: "11",
        idParada: "1",
        nombreAcceso: "Acceso norte",
        latitud: 14.6349,
        longitud: -90.5069,
        tipoAcceso: TipoAcceso.RAMPA,
        estadoAcceso: EstadoAcceso.HABILITADO,
      });
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.ACCESO,
        entityId: "11",
        detalle: {
          idParada: "1",
          nombreAcceso: "Acceso norte",
          tipoAcceso: TipoAcceso.RAMPA,
          estadoAcceso: EstadoAcceso.HABILITADO,
        },
      });
    });

    it("keeps an explicit estado", async () => {
      accesoRepo.create.mockImplementation((v) => v);
      accesoRepo.save.mockImplementation(async (v) => ({ ...v, idAcceso: "12" }));

      const result = await service.create(
        "1",
        { ...dto, estadoAcceso: EstadoAcceso.DESHABILITADO },
        ACTOR
      );

      expect(result.estadoAcceso).toBe(EstadoAcceso.DESHABILITADO);
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      paradaMissing();

      await expect(service.create("99", dto, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(accesoRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe("findOne", () => {
    it("looks the acceso up scoped to the parada", async () => {
      accesoRepo.findOne.mockResolvedValue(makeAcceso());

      const result = await service.findOne("1", "10");

      expect(accesoRepo.findOne).toHaveBeenCalledWith({
        where: { idAcceso: "10", idParada: "1" },
      });
      expect(result.idAcceso).toBe("10");
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      paradaMissing();

      await expect(service.findOne("99", "10")).rejects.toThrow(
        "Parada con ID 99 no encontrada"
      );
      expect(accesoRepo.findOne).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the acceso does not exist", async () => {
      accesoRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("1", "404")).rejects.toThrow(
        "Acceso con ID 404 no encontrado en la parada 1"
      );
    });

    it("throws NotFoundException when the acceso belongs to another parada", async () => {
      // Acceso 10 exists under parada 1; the scoped query for parada 2 finds nothing.
      accesoRepo.findOne.mockImplementation(async (options: any) =>
        options.where.idParada === "1" ? makeAcceso() : null
      );

      await expect(service.findOne("2", "10")).rejects.toThrow(
        "Acceso con ID 10 no encontrado en la parada 2"
      );
    });
  });

  describe("update", () => {
    it("updates the provided fields and keeps the owning parada", async () => {
      accesoRepo.findOne.mockResolvedValue(makeAcceso());
      accesoRepo.save.mockImplementation(async (v) => v);

      const result = await service.update(
        "1",
        "10",
        { nombreAcceso: "Acceso sur", tipoAcceso: TipoAcceso.ELEVADOR },
        ACTOR
      );

      expect(result).toEqual(
        expect.objectContaining({
          idAcceso: "10",
          idParada: "1",
          nombreAcceso: "Acceso sur",
          tipoAcceso: TipoAcceso.ELEVADOR,
          latitud: 14.6349,
        })
      );
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.ACCESO,
        entityId: "10",
        detalle: { idParada: "1", changedFields: ["nombreAcceso", "tipoAcceso"] },
      });
    });

    it("ignores an idParada smuggled into the body", async () => {
      accesoRepo.findOne.mockResolvedValue(makeAcceso());
      accesoRepo.save.mockImplementation(async (v) => v);

      const result = await service.update(
        "1",
        "10",
        { idParada: "2" } as unknown as { nombreAcceso: string },
        ACTOR
      );

      expect(result.idParada).toBe("1");
    });

    it("throws NotFoundException when the acceso belongs to another parada", async () => {
      accesoRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update("2", "10", { nombreAcceso: "X" }, ACTOR)
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(accesoRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      paradaMissing();

      await expect(
        service.update("99", "10", { nombreAcceso: "X" }, ACTOR)
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(accesoRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("soft deletes by marking the acceso DESHABILITADO", async () => {
      accesoRepo.findOne.mockResolvedValue(makeAcceso());
      accesoRepo.save.mockImplementation(async (v) => v);

      await service.remove("1", "10", ACTOR);

      expect(accesoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idAcceso: "10",
          estadoAcceso: EstadoAcceso.DESHABILITADO,
        })
      );
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.ACCESO,
        entityId: "10",
        detalle: { idParada: "1", nombreAcceso: "Acceso norte" },
      });
    });

    it("throws NotFoundException when the acceso is missing", async () => {
      accesoRepo.findOne.mockResolvedValue(null);

      await expect(service.remove("1", "404", ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(accesoRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      paradaMissing();

      await expect(service.remove("99", "10", ACTOR)).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(accesoRepo.save).not.toHaveBeenCalled();
    });
  });
});
