import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";
import type { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import type { LineaService } from "../../infrastructure/linea/linea.service.js";
import type { ParqueoService } from "../../infrastructure/parqueo/parqueo.service.js";
import { LineaParadaEntity } from "../../infrastructure/linea/linea-parada.entity.js";
import { AsignacionUnidadEntity } from "../asignacion-unidad/asignacion-unidad.entity.js";
import { FLEET_AUDIT_ACTIONS, FLEET_MODULE } from "../shared/fleet.constants.js";
import {
  DuplicatePlate,
  EnServicioRequiresBothAssignments,
  UnitCannotBeCreatedEnServicio,
  UnitNotFound,
} from "../shared/fleet.errors.js";
import type { CreateUnidadDto } from "./dto/create-unidad.dto.js";
import { EstadoUnidad, UnidadEntity } from "./unidad.entity.js";
import { UnidadService } from "./unidad.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

function makeUnidad(overrides: Partial<UnidadEntity> = {}): UnidadEntity {
  return {
    id: "1",
    numeroPlaca: "AB-12345",
    marca: "Volvo",
    modelo: "B440",
    anio: 2024,
    capacidadPasajeros: 50,
    estadoUnidad: EstadoUnidad.DISPONIBLE,
    fechaRegistro: new Date("2026-01-01T00:00:00Z"),
    fechaActualizacion: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function baseCreateDto(overrides: Partial<CreateUnidadDto> = {}): CreateUnidadDto {
  return {
    numeroPlaca: "AB-12345",
    marca: "Volvo",
    modelo: "B440",
    anio: 2024,
    capacidadPasajeros: 50,
    ...overrides,
  };
}

// Pilot assignment has no TypeORM entity yet (Slice 4), so UnidadService
// still reads tbl_asignacion_piloto via raw SQL — this dispatcher covers
// only that table now. Line assignment reads go through
// AsignacionUnidadEntity's repository (Priority 1 reconciliation: a single
// canonical, entity-based path shared with AsignacionUnidadService,
// replacing the raw-SQL duplicate this service used in Slice 2).
function makePilotQueryDispatcher(options: { pilotRow?: { idEmpleado: string } }): AnyMock {
  return jest.fn(async (sql: string) => {
    if (sql.includes("tbl_asignacion_piloto")) {
      return options.pilotRow ? [options.pilotRow] : [];
    }
    throw new Error(`unexpected query: ${sql}`);
  });
}

function makeAsignacionUnidad(idLinea: string): AsignacionUnidadEntity {
  return {
    id: "a1",
    idUnidad: "1",
    idLinea,
    fechaAsignacion: new Date("2026-01-01T00:00:00Z"),
    fechaActualizacion: new Date("2026-01-01T00:00:00Z"),
    idLineaParadaActual: null,
    fechaReporteUbicacion: null,
  };
}

describe("UnidadService", () => {
  let unidadRepo: { existsBy: AnyMock; findOne: AnyMock; find: AnyMock };
  let txUnidadRepo: { existsBy: AnyMock; findOne: AnyMock; create: AnyMock; save: AnyMock };
  let employeeRepo: { findOneOrFail: AnyMock };
  let asignacionUnidadRepo: { findOne: AnyMock };
  let txAsignacionUnidadRepo: { findOne: AnyMock };
  let lineaParadaRepo: { findOne: AnyMock };
  let manager: { getRepository: AnyMock; query: AnyMock };
  let dataSource: { getRepository: AnyMock; query: AnyMock; transaction: AnyMock };
  let auditRepo: { create: AnyMock };
  let lineaService: { findOne: AnyMock };
  let parqueoService: { findOne: AnyMock };
  let service: UnidadService;

  beforeEach(() => {
    unidadRepo = { existsBy: jest.fn(), findOne: jest.fn(), find: jest.fn() };
    txUnidadRepo = {
      existsBy: jest.fn(async () => false),
      findOne: jest.fn(),
      create: jest.fn((v: object) => v),
      // Simulates the DB assigning the generated id on insert, like a real
      // TypeORM save() does for a brand-new entity without one yet.
      save: jest.fn(async (v: Partial<UnidadEntity>) => ({ id: v.id ?? "1", ...v }) as UnidadEntity),
    };
    employeeRepo = { findOneOrFail: jest.fn(async () => ({ id: "actor-1" }) as EmployeeEntity) };
    // Default: no line assignment found for any unit (repository-backed,
    // same table AsignacionUnidadService reads/writes — see Priority 1
    // reconciliation note on makePilotQueryDispatcher above).
    asignacionUnidadRepo = { findOne: jest.fn(async () => null) };
    txAsignacionUnidadRepo = { findOne: jest.fn(async () => null) };
    lineaParadaRepo = { findOne: jest.fn(async () => null) };
    auditRepo = { create: jest.fn(async () => ({})) };
    lineaService = { findOne: jest.fn() };
    parqueoService = { findOne: jest.fn() };

    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === UnidadEntity) return txUnidadRepo;
        if (entity === EmployeeEntity) return employeeRepo;
        if (entity === AsignacionUnidadEntity) return txAsignacionUnidadRepo;
        if (entity === LineaParadaEntity) return lineaParadaRepo;
        throw new Error(`unexpected repository requested: ${String(entity)}`);
      }),
      // Default: no pilot assignment found for any unit.
      query: makePilotQueryDispatcher({}),
    };
    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === UnidadEntity) return unidadRepo;
        if (entity === AsignacionUnidadEntity) return asignacionUnidadRepo;
        if (entity === LineaParadaEntity) return lineaParadaRepo;
        throw new Error(`unexpected repository requested: ${String(entity)}`);
      }),
      query: makePilotQueryDispatcher({}),
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
    };

    service = new UnidadService(
      dataSource as unknown as DataSource,
      auditRepo as unknown as AuditRepository,
      lineaService as unknown as LineaService,
      parqueoService as unknown as ParqueoService,
    );
  });

  describe("create", () => {
    it("throws DuplicatePlate before any write when numeroPlaca is taken", async () => {
      txUnidadRepo.existsBy.mockResolvedValue(true);

      await expect(service.create(baseCreateDto(), "actor-1")).rejects.toThrow(DuplicatePlate);
      expect(txUnidadRepo.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("throws UnitCannotBeCreatedEnServicio when estadoUnidad is EN_SERVICIO", async () => {
      const dto = baseCreateDto({ estadoUnidad: EstadoUnidad.EN_SERVICIO });

      await expect(service.create(dto, "actor-1")).rejects.toThrow(UnitCannotBeCreatedEnServicio);
      expect(txUnidadRepo.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("creates with estadoUnidad forced to DISPONIBLE and writes a CREATE audit row", async () => {
      const result = await service.create(baseCreateDto(), "actor-1");

      expect(txUnidadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoUnidad: EstadoUnidad.DISPONIBLE, numeroPlaca: "AB-12345" }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.CREATE,
          module: FLEET_MODULE,
          entityType: "unidad",
          result: AUDIT_RESULTS.SUCCESS,
          detalle: expect.objectContaining({
            numeroPlaca: "AB-12345",
            estadoUnidad: EstadoUnidad.DISPONIBLE,
          }),
        }),
      );
      expect(result.estadoUnidad).toBe(EstadoUnidad.DISPONIBLE);
      expect(result.idUnidad).toBe("1");
      // A brand-new unit cannot have a line/pilot assignment yet.
      expect(result.idLinea).toBeUndefined();
      expect(result.parqueo).toBeUndefined();
    });

    it("explicitly sets fechaRegistro and fechaActualizacion (no DB default reliance)", async () => {
      const before = Date.now();
      await service.create(baseCreateDto(), "actor-1");
      const after = Date.now();

      const saved = txUnidadRepo.save.mock.calls[0]![0] as UnidadEntity;
      expect(saved.fechaRegistro.getTime()).toBeGreaterThanOrEqual(before);
      expect(saved.fechaRegistro.getTime()).toBeLessThanOrEqual(after);
      expect(saved.fechaActualizacion.getTime()).toEqual(saved.fechaRegistro.getTime());
    });
  });

  describe("update", () => {
    it("throws UnitNotFound for a non-existent unit", async () => {
      txUnidadRepo.findOne.mockResolvedValue(null);

      await expect(service.update("missing", { marca: "Scania" }, "actor-1")).rejects.toThrow(
        UnitNotFound,
      );
      expect(txUnidadRepo.save).not.toHaveBeenCalled();
    });

    it("throws EnServicioRequiresBothAssignments when neither line nor pilot is assigned", async () => {
      txUnidadRepo.findOne.mockResolvedValue(makeUnidad());

      await expect(
        service.update("1", { estadoUnidad: EstadoUnidad.EN_SERVICIO }, "actor-1"),
      ).rejects.toThrow(EnServicioRequiresBothAssignments);
      expect(txUnidadRepo.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("throws EnServicioRequiresBothAssignments when only the line is assigned (pilot missing)", async () => {
      txUnidadRepo.findOne.mockResolvedValue(makeUnidad());
      txAsignacionUnidadRepo.findOne.mockResolvedValue(makeAsignacionUnidad("10"));

      await expect(
        service.update("1", { estadoUnidad: EstadoUnidad.EN_SERVICIO }, "actor-1"),
      ).rejects.toThrow(EnServicioRequiresBothAssignments);
      expect(txUnidadRepo.save).not.toHaveBeenCalled();
    });

    it("throws EnServicioRequiresBothAssignments when only the pilot is assigned (line missing)", async () => {
      txUnidadRepo.findOne.mockResolvedValue(makeUnidad());
      manager.query = makePilotQueryDispatcher({ pilotRow: { idEmpleado: "emp-9" } });

      await expect(
        service.update("1", { estadoUnidad: EstadoUnidad.EN_SERVICIO }, "actor-1"),
      ).rejects.toThrow(EnServicioRequiresBothAssignments);
      expect(txUnidadRepo.save).not.toHaveBeenCalled();
    });

    it("accepts EN_SERVICIO when both line and pilot assignments exist", async () => {
      txUnidadRepo.findOne.mockResolvedValue(makeUnidad());
      txAsignacionUnidadRepo.findOne.mockResolvedValue(makeAsignacionUnidad("10"));
      manager.query = makePilotQueryDispatcher({ pilotRow: { idEmpleado: "emp-9" } });
      lineaService.findOne.mockResolvedValue({ idLinea: "10", idParqueo: "5" });
      parqueoService.findOne.mockResolvedValue({ idParqueo: "5", nombreParqueo: "Central" });

      const result = await service.update(
        "1",
        { estadoUnidad: EstadoUnidad.EN_SERVICIO },
        "actor-1",
      );

      expect(txUnidadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoUnidad: EstadoUnidad.EN_SERVICIO }),
      );
      expect(result.estadoUnidad).toBe(EstadoUnidad.EN_SERVICIO);
      expect(result.idLinea).toBe("10");
      expect(result.idEmpleadoPiloto).toBe("emp-9");
    });

    it("allows transitioning to MANTENIMIENTO and explicitly sets fechaActualizacion", async () => {
      txUnidadRepo.findOne.mockResolvedValue(
        makeUnidad({ fechaActualizacion: new Date("2020-01-01T00:00:00Z") }),
      );

      const before = Date.now();
      const result = await service.update(
        "1",
        { estadoUnidad: EstadoUnidad.MANTENIMIENTO },
        "actor-1",
      );
      const after = Date.now();

      const saved = txUnidadRepo.save.mock.calls[0]![0] as UnidadEntity;
      expect(saved.estadoUnidad).toBe(EstadoUnidad.MANTENIMIENTO);
      expect(saved.fechaActualizacion.getTime()).toBeGreaterThanOrEqual(before);
      expect(saved.fechaActualizacion.getTime()).toBeLessThanOrEqual(after);
      expect(result.estadoUnidad).toBe(EstadoUnidad.MANTENIMIENTO);
    });

    it("writes an UPDATE audit row with before/after detalle limited to changed fields", async () => {
      txUnidadRepo.findOne.mockResolvedValue(makeUnidad({ capacidadPasajeros: 50 }));

      await service.update("1", { capacidadPasajeros: 60 }, "actor-1");

      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.UPDATE,
          entityType: "unidad",
          detalle: { before: { capacidadPasajeros: 50 }, after: { capacidadPasajeros: 60 } },
        }),
      );
    });

    it("applies a partial update without resetting untouched fields", async () => {
      txUnidadRepo.findOne.mockResolvedValue(makeUnidad());

      await service.update("1", { numeroPlaca: "CD-67890" }, "actor-1");

      const saved = txUnidadRepo.save.mock.calls[0]![0] as UnidadEntity;
      expect(saved.numeroPlaca).toBe("CD-67890");
      expect(saved.marca).toBe("Volvo");
    });
  });

  describe("remove", () => {
    it("throws UnitNotFound for a non-existent unit", async () => {
      txUnidadRepo.findOne.mockResolvedValue(null);

      await expect(service.remove("missing", "actor-1")).rejects.toThrow(UnitNotFound);
    });

    it("sets estadoUnidad = FUERA_DE_SERVICIO and writes a REMOVE audit row", async () => {
      txUnidadRepo.findOne.mockResolvedValue(makeUnidad({ estadoUnidad: EstadoUnidad.DISPONIBLE }));

      await service.remove("1", "actor-1");

      expect(txUnidadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoUnidad: EstadoUnidad.FUERA_DE_SERVICIO }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.REMOVE,
          entityType: "unidad",
          detalle: { estadoAnterior: EstadoUnidad.DISPONIBLE },
        }),
      );
    });

    it("does not cascade-unassign when removing a unit already EN_SERVICIO (delivery note)", async () => {
      txUnidadRepo.findOne.mockResolvedValue(makeUnidad({ estadoUnidad: EstadoUnidad.EN_SERVICIO }));

      await service.remove("1", "actor-1");

      expect(txUnidadRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estadoUnidad: EstadoUnidad.FUERA_DE_SERVICIO }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ detalle: { estadoAnterior: EstadoUnidad.EN_SERVICIO } }),
      );
    });
  });

  describe("findOne", () => {
    it("returns the unit response with no derived fields when unassigned", async () => {
      unidadRepo.findOne.mockResolvedValue(makeUnidad());

      const result = await service.findOne("1");

      expect(unidadRepo.findOne).toHaveBeenCalledWith({ where: { id: "1" } });
      expect(result.idUnidad).toBe("1");
      expect(result.numeroPlaca).toBe("AB-12345");
      expect(result.idLinea).toBeUndefined();
      expect(result.parqueo).toBeUndefined();
      expect(result.idEmpleadoPiloto).toBeUndefined();
    });

    it("throws UnitNotFound when the unit does not exist", async () => {
      unidadRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne("missing")).rejects.toThrow(UnitNotFound);
    });

    it("includes the derived idLinea and parqueo when the unit has a line assignment", async () => {
      unidadRepo.findOne.mockResolvedValue(makeUnidad());
      asignacionUnidadRepo.findOne.mockResolvedValue(makeAsignacionUnidad("10"));
      lineaService.findOne.mockResolvedValue({ idLinea: "10", idParqueo: "5" });
      parqueoService.findOne.mockResolvedValue({
        idParqueo: "5",
        nombreParqueo: "Parqueo Central",
      });

      const result = await service.findOne("1");

      expect(result.idLinea).toBe("10");
      expect(lineaService.findOne).toHaveBeenCalledWith("10");
      expect(parqueoService.findOne).toHaveBeenCalledWith("5");
      expect(result.parqueo).toEqual(
        expect.objectContaining({ idParqueo: "5", nombreParqueo: "Parqueo Central" }),
      );
    });

    it("exposes idLineaParadaActual and fechaReporteUbicacion when the assignment has a current stop", async () => {
      const reportDate = new Date("2026-02-03T10:00:00Z");
      unidadRepo.findOne.mockResolvedValue(makeUnidad());
      asignacionUnidadRepo.findOne.mockResolvedValue({
        ...makeAsignacionUnidad("10"),
        idLineaParadaActual: "77",
        fechaReporteUbicacion: reportDate,
      });
      lineaService.findOne.mockResolvedValue({ idLinea: "10", idParqueo: "5" });
      parqueoService.findOne.mockResolvedValue({ idParqueo: "5", nombreParqueo: "Central" });

      const result = await service.findOne("1");

      expect(result.idLineaParadaActual).toBe("77");
      expect(result.fechaReporteUbicacion).toEqual(reportDate);
    });

    it("leaves current stop fields undefined when the assignment has a null stop", async () => {
      unidadRepo.findOne.mockResolvedValue(makeUnidad());
      asignacionUnidadRepo.findOne.mockResolvedValue(makeAsignacionUnidad("10"));
      lineaService.findOne.mockResolvedValue({ idLinea: "10", idParqueo: "5" });
      parqueoService.findOne.mockResolvedValue({ idParqueo: "5", nombreParqueo: "Central" });

      const result = await service.findOne("1");

      expect(result.idLinea).toBe("10");
      expect(result.idLineaParadaActual).toBeUndefined();
      expect(result.fechaReporteUbicacion).toBeUndefined();
    });

    it("leaves current stop fields undefined when the unit has no line assignment", async () => {
      unidadRepo.findOne.mockResolvedValue(makeUnidad());

      const result = await service.findOne("1");

      expect(result.idLineaParadaActual).toBeUndefined();
      expect(result.fechaReporteUbicacion).toBeUndefined();
    });

    it("includes the derived idEmpleadoPiloto when the unit has a pilot assignment", async () => {
      unidadRepo.findOne.mockResolvedValue(makeUnidad());
      dataSource.query = makePilotQueryDispatcher({ pilotRow: { idEmpleado: "emp-9" } });

      const result = await service.findOne("1");

      expect(result.idEmpleadoPiloto).toBe("emp-9");
      expect(result.idLinea).toBeUndefined();
      expect(result.parqueo).toBeUndefined();
    });
  });

  describe("findAll", () => {
    it("returns all units mapped to response DTOs", async () => {
      unidadRepo.find.mockResolvedValue([
        makeUnidad({ id: "1" }),
        makeUnidad({ id: "2", numeroPlaca: "CD-67890" }),
      ]);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]?.idUnidad).toBe("1");
      expect(result[1]?.numeroPlaca).toBe("CD-67890");
    });
  });
});
