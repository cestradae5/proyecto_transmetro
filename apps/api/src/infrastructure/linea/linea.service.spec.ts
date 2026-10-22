// PR#3 infraestructura-hardening — LineaService unit tests (mocked repositories).
// Same pattern as parada.service.spec.ts: direct instantiation, no TestingModule.

import { jest } from "@jest/globals";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { EntityManager, Repository } from "typeorm";

import type { InfrastructureAuditService } from "../shared/infrastructure-audit.service.js";
import type { AfectacionService } from "../afectacion/afectacion.service.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
} from "../shared/infrastructure-audit.constants.js";
import { CreateLineaDto } from "./dto/create-linea.dto.js";
import { ReorderLineaParadasDto } from "./dto/reorder-linea-paradas.dto.js";
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
  manager: { transaction: AnyMock };
};

const ACTOR = "7";

function makeMockRepository(): MockRepository {
  const repo: MockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const manager = { getRepository: () => repo } as unknown as EntityManager;
  repo.manager.transaction.mockImplementation(
    async (cb: (m: EntityManager) => unknown) => cb(manager)
  );
  return repo;
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

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function errorCode(error: unknown): unknown {
  return ((error as HttpException).getResponse() as { error?: string }).error;
}

describe("LineaService", () => {
  let lineaRepo: MockRepository;
  let parqueoRepo: MockRepository;
  let lineaParadaRepo: MockRepository;
  let paradaRepo: MockRepository;
  let audit: { record: AnyMock };
  let afectaciones: { aplicarSiCambia: AnyMock };
  let calls: string[];
  let service: LineaService;

  beforeEach(() => {
    lineaRepo = makeMockRepository();
    parqueoRepo = makeMockRepository();
    lineaParadaRepo = makeMockRepository();
    paradaRepo = makeMockRepository();
    audit = { record: jest.fn() };
    calls = [];
    afectaciones = {
      aplicarSiCambia: jest.fn(async () => {
        calls.push("aplicar");
        return null;
      }),
    };
    service = new LineaService(
      lineaRepo as unknown as Repository<LineaEntity>,
      parqueoRepo as unknown as Repository<ParqueoEntity>,
      lineaParadaRepo as unknown as Repository<LineaParadaEntity>,
      paradaRepo as unknown as Repository<ParadaEntity>,
      audit as unknown as InfrastructureAuditService,
      afectaciones as unknown as AfectacionService
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

      const result = await service.create(dto, ACTOR);

      expect(parqueoRepo.count).toHaveBeenCalledWith({
        where: { idParqueo: "10" },
      });
      expect(lineaRepo.save).toHaveBeenCalledWith(saved);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
        entityId: "1",
        detalle: { numeroLinea: "L1", nombreLinea: "Línea 1" },
      });
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

      await expect(service.create(dto, ACTOR)).rejects.toThrow(NotFoundException);
      expect(lineaRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("creates a línea without parqueo and skips the FK check", async () => {
      const { idParqueo: _omitted, ...withoutParqueo } = dto;
      const saved = makeLinea({ idParqueo: null });
      lineaRepo.create.mockReturnValue(saved);
      lineaRepo.save.mockResolvedValue(saved);

      const result = await service.create(withoutParqueo, ACTOR);

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

      const result = await service.update("1", { nombreLinea: "Renombrada" }, ACTOR);

      expect(parqueoRepo.count).not.toHaveBeenCalled();
      expect(result.nombreLinea).toBe("Renombrada");
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
        entityId: "1",
        detalle: { changedFields: ["nombreLinea"] },
      });
    });

    it("validates the new parqueo FK when idParqueo is provided", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      parqueoRepo.count.mockResolvedValue(0);
      parqueoRepo.findOne.mockResolvedValue(null);

      await expect(service.update("1", { idParqueo: "999" }, ACTOR)).rejects.toThrow(
        NotFoundException
      );
      expect(lineaRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("clears the parqueo without FK validation when idParqueo is null", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      lineaRepo.save.mockImplementation(async (l: LineaEntity) => l);

      const result = await service.update("1", { idParqueo: null }, ACTOR);

      expect(parqueoRepo.count).not.toHaveBeenCalled();
      expect(result.idParqueo).toBeNull();
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(service.update("missing", {}, ACTOR)).rejects.toThrow(
        NotFoundException
      );
      expect(afectaciones.aplicarSiCambia).not.toHaveBeenCalled();
    });

    it.each([
      [EstadoLinea.ACTIVA, EstadoLinea.INACTIVA, "DESACTIVAR", "Desactivada desde Líneas"],
      [EstadoLinea.INACTIVA, EstadoLinea.ACTIVA, "ACTIVAR", "Activada desde Líneas"],
    ])(
      "routes an estado change %s→%s through an afectación before saving the other fields",
      async (from, to, accion, motivo) => {
        lineaRepo.findOne.mockResolvedValue(makeLinea({ estadoLinea: from }));
        lineaRepo.save.mockImplementation(async (l: LineaEntity) => {
          calls.push("save");
          return l;
        });

        const result = await service.update(
          "1",
          { estadoLinea: to as never, nombreLinea: "Renombrada" },
          ACTOR
        );

        expect(afectaciones.aplicarSiCambia).toHaveBeenCalledWith(
          expect.anything(),
          { accion, motivo, fechaInicio: today(), idLinea: "1" },
          ACTOR
        );
        expect(calls).toEqual(["aplicar", "save"]);
        expect(lineaRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ nombreLinea: "Renombrada", estadoLinea: to })
        );
        expect(result.estadoLinea).toBe(to);
        expect(audit.record).toHaveBeenCalledTimes(1);
        expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
          action: INFRASTRUCTURE_AUDIT_ACTIONS.UPDATE,
          entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
          entityId: "1",
          detalle: { changedFields: ["estadoLinea", "nombreLinea"] },
        });
      }
    );

    it("leaves an unchanged estado to the engine (decided under its row lock) and skips it when absent", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      lineaRepo.save.mockImplementation(async (l: LineaEntity) => l);

      await service.update("1", { estadoLinea: EstadoLinea.ACTIVA as never }, ACTOR);
      await service.update("1", { nombreLinea: "Renombrada" }, ACTOR);

      expect(afectaciones.aplicarSiCambia).toHaveBeenCalledTimes(1);
      expect(afectaciones.aplicarSiCambia).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ accion: "ACTIVAR", idLinea: "1" }),
        ACTOR
      );
    });

    it("saves over the row re-read under a FOR UPDATE lock, never the stale estado read before the transaction", async () => {
      lineaRepo.findOne
        .mockResolvedValueOnce(makeLinea())
        .mockResolvedValueOnce(makeLinea({ estadoLinea: EstadoLinea.INACTIVA }));
      lineaRepo.save.mockImplementation(async (l: LineaEntity) => l);

      const result = await service.update("1", { nombreLinea: "Renombrada" }, ACTOR);

      expect(afectaciones.aplicarSiCambia).not.toHaveBeenCalled();
      expect(lineaRepo.findOne).toHaveBeenLastCalledWith({
        where: { idLinea: "1" },
        lock: { mode: "pessimistic_write" },
      });
      expect(lineaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ nombreLinea: "Renombrada", estadoLinea: EstadoLinea.INACTIVA })
      );
      expect(result.estadoLinea).toBe(EstadoLinea.INACTIVA);
    });
  });

  describe("remove", () => {
    it("soft deletes through a DESACTIVAR afectación (with cascade) and audits the remove", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());

      await service.remove("1", ACTOR);

      expect(afectaciones.aplicarSiCambia).toHaveBeenCalledWith(
        expect.anything(),
        {
          accion: "DESACTIVAR",
          motivo: "Desactivada desde Líneas",
          fechaInicio: today(),
          idLinea: "1",
        },
        ACTOR
      );
      // The engine writes the estado; the service never saves a stale row.
      expect(lineaRepo.save).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
        entityId: "1",
        detalle: { numeroLinea: "L1" },
      });
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(service.remove("missing", ACTOR)).rejects.toThrow(NotFoundException);
      expect(afectaciones.aplicarSiCambia).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("keeps an already INACTIVA línea as is: the engine applies nothing, remove still audited", async () => {
      lineaRepo.findOne
        .mockResolvedValueOnce(makeLinea())
        .mockResolvedValueOnce(makeLinea({ estadoLinea: EstadoLinea.INACTIVA }));

      await service.remove("1", ACTOR);

      expect(afectaciones.aplicarSiCambia).toHaveBeenCalledTimes(1);
      expect(lineaRepo.findOne).toHaveBeenLastCalledWith({
        where: { idLinea: "1" },
        lock: { mode: "pessimistic_write" },
      });
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.objectContaining({ action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE, entityId: "1" })
      );
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

      const result = await service.addParada("1", dto, ACTOR);

      expect(paradaRepo.count).toHaveBeenCalledWith({ where: { idParada: "5" } });
      expect(lineaParadaRepo.create).toHaveBeenCalledWith({
        idLinea: "1",
        idParada: "5",
        orden: 1,
        minutosHastaSiguiente: 5,
      });
      expect(lineaParadaRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.LINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_PARADA,
        entityId: "1",
        detalle: { idParada: "5", orden: 1 },
      });
    });

    it("allows adding to an empty línea (minimum rule only guards removal)", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      paradaRepo.count.mockResolvedValue(1);
      lineaParadaRepo.findOne.mockResolvedValue(null);
      lineaParadaRepo.create.mockReturnValue(makeLineaParada());
      lineaParadaRepo.save.mockResolvedValue(makeLineaParada());

      await expect(service.addParada("1", dto, ACTOR)).resolves.toBeDefined();
      expect(lineaParadaRepo.count).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(service.addParada("missing", dto, ACTOR)).rejects.toThrow(
        NotFoundException
      );
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the parada does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      paradaRepo.count.mockResolvedValue(0);
      paradaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addParada("1", { ...dto, idParada: "999" }, ACTOR)
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
        .addParada("1", { idParada: "6", orden: 1, minutosHastaSiguiente: 3 }, ACTOR)
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
        .addParada("1", { idParada: "5", orden: 4, minutosHastaSiguiente: 3 }, ACTOR)
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
      }, ACTOR);

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
      }, ACTOR);

      expect(lineaParadaRepo.findOne).toHaveBeenCalledTimes(1);
      expect(result.minutosHastaSiguiente).toBe(9);
      expect(result.orden).toBe(1);
    });

    it("rejects an orden used by another record with 409 ORDEN_DUPLICATE", async () => {
      lineaParadaRepo.findOne
        .mockResolvedValueOnce(makeLineaParada())
        .mockResolvedValueOnce(makeLineaParada({ idLineaParada: "101", orden: 2 }));

      const error = await service
        .updateParada("1", "100", { orden: 2 }, ACTOR)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("ORDEN_DUPLICATE");
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the record belongs to another línea", async () => {
      lineaParadaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateParada("2", "100", { orden: 3 }, ACTOR)
      ).rejects.toThrow(NotFoundException);
      expect(lineaParadaRepo.findOne).toHaveBeenCalledWith({
        where: { idLineaParada: "100", idLinea: "2" },
      });
      expect(lineaParadaRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("reorderParadas", () => {
    type MockManager = Record<"find" | "increment" | "update", AnyMock>;
    let manager: MockManager;
    let transaction: AnyMock;

    const current = [
      makeLineaParada({ idLineaParada: "100", orden: 1, minutosHastaSiguiente: 4 }),
      makeLineaParada({ idLineaParada: "101", orden: 2, idParada: "6", minutosHastaSiguiente: 6 }),
      makeLineaParada({ idLineaParada: "102", orden: 5, idParada: "7", minutosHastaSiguiente: 0 }),
    ];

    beforeEach(() => {
      manager = { find: jest.fn(), increment: jest.fn(), update: jest.fn() };
      transaction = jest.fn(async (cb: (m: MockManager) => unknown) => cb(manager));
      Object.assign(lineaParadaRepo, { manager: { transaction } });
    });

    it("shifts above the max orden, then writes 1..n inside one transaction", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      const reordered = [current[2], current[0], current[1]];
      manager.find
        .mockResolvedValueOnce(current) // validation snapshot
        .mockResolvedValueOnce(reordered); // final listing

      const result = await service.reorderParadas("1", {
        idsLineaParada: ["102", "100", "101"],
      }, ACTOR);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(manager.find).toHaveBeenNthCalledWith(1, LineaParadaEntity, {
        where: { idLinea: "1" },
      });
      // Phase 1: offset = current max orden (5), so shifted values never collide.
      expect(manager.increment).toHaveBeenCalledWith(
        LineaParadaEntity,
        { idLinea: "1" },
        "orden",
        5
      );
      // Phase 2: final positions, only orden is written.
      expect(manager.update.mock.calls).toEqual([
        [LineaParadaEntity, { idLineaParada: "102", idLinea: "1" }, { orden: 1 }],
        [LineaParadaEntity, { idLineaParada: "100", idLinea: "1" }, { orden: 2 }],
        [LineaParadaEntity, { idLineaParada: "101", idLinea: "1" }, { orden: 3 }],
      ]);
      expect(manager.increment.mock.invocationCallOrder[0]).toBeLessThan(
        manager.update.mock.invocationCallOrder[0]!
      );
      expect(manager.find).toHaveBeenNthCalledWith(2, LineaParadaEntity, {
        where: { idLinea: "1" },
        relations: { parada: true },
        order: { orden: "ASC" },
      });
      expect(result).toEqual(reordered);
    });

    it("accepts numeric ids from the database (bigint as string or number)", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      manager.find
        .mockResolvedValueOnce(
          current.map((r) => ({ ...r, idLineaParada: Number(r.idLineaParada) }))
        )
        .mockResolvedValueOnce([]);

      await expect(
        service.reorderParadas("1", { idsLineaParada: ["101", "102", "100"] }, ACTOR)
      ).resolves.toEqual([]);
      expect(manager.update).toHaveBeenCalledTimes(3);
    });

    it("does nothing but list when the línea has no paradas and the list is empty", async () => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      manager.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await expect(
        service.reorderParadas("1", { idsLineaParada: [] }, ACTOR)
      ).resolves.toEqual([]);
      expect(manager.increment).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it.each([
      ["a duplicated id", ["100", "100", "101"]],
      ["a missing id", ["100", "101"]],
      ["an id of another línea", ["100", "101", "999"]],
      ["an extra id", ["100", "101", "102", "103"]],
    ])("rejects %s with 400 ORDEN_LIST_MISMATCH", async (_label, ids) => {
      lineaRepo.findOne.mockResolvedValue(makeLinea());
      manager.find.mockResolvedValueOnce(current);

      const error = await service
        .reorderParadas("1", { idsLineaParada: ids }, ACTOR)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(errorCode(error)).toBe("ORDEN_LIST_MISMATCH");
      expect(manager.increment).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the línea does not exist", async () => {
      lineaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reorderParadas("missing", { idsLineaParada: ["100"] }, ACTOR)
      ).rejects.toThrow(NotFoundException);
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe("ReorderLineaParadasDto validation", () => {
    it("accepts an array of ids", async () => {
      const errors = await validate(
        plainToInstance(ReorderLineaParadasDto, { idsLineaParada: ["1", "2"] })
      );

      expect(errors).toHaveLength(0);
    });

    it.each([
      ["a missing list", {}],
      ["a non-array value", { idsLineaParada: "1" }],
      ["non-string ids", { idsLineaParada: [1, 2] }],
      ["empty ids", { idsLineaParada: ["1", ""] }],
    ])("rejects %s", async (_label, body) => {
      const errors = await validate(plainToInstance(ReorderLineaParadasDto, body));

      expect(errors.map((e) => e.property)).toContain("idsLineaParada");
    });
  });

  describe("removeParada", () => {
    it("deletes the record when the línea has 3 paradas", async () => {
      const record = makeLineaParada();
      lineaParadaRepo.findOne.mockResolvedValue(record);
      lineaParadaRepo.count.mockResolvedValue(3);
      lineaParadaRepo.remove.mockResolvedValue(record);

      await service.removeParada("1", "100", ACTOR);

      expect(lineaParadaRepo.count).toHaveBeenCalledWith({
        where: { idLinea: "1" },
      });
      expect(lineaParadaRepo.remove).toHaveBeenCalledWith(record);
      expect(audit.record).toHaveBeenCalledWith(expect.anything(), ACTOR, {
        action: INFRASTRUCTURE_AUDIT_ACTIONS.UNLINK,
        entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA_PARADA,
        entityId: "1",
        detalle: { lineaParadaId: "100", idParada: "5" },
      });
    });

    it("rejects removal with 409 LINEA_MIN_PARADAS when only 2 paradas remain", async () => {
      lineaParadaRepo.findOne.mockResolvedValue(makeLineaParada());
      lineaParadaRepo.count.mockResolvedValue(2);

      const error = await service
        .removeParada("1", "100", ACTOR)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCode(error)).toBe("LINEA_MIN_PARADAS");
      expect(lineaParadaRepo.remove).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the record belongs to another línea", async () => {
      lineaParadaRepo.findOne.mockResolvedValue(null);

      await expect(service.removeParada("2", "100", ACTOR)).rejects.toThrow(
        NotFoundException
      );
      expect(lineaParadaRepo.count).not.toHaveBeenCalled();
      expect(lineaParadaRepo.remove).not.toHaveBeenCalled();
    });
  });
});
