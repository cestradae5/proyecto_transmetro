import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";
import type { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import { LineaParadaEntity } from "../../infrastructure/linea/linea-parada.entity.js";
import type { LineaService } from "../../infrastructure/linea/linea.service.js";
import { FLEET_AUDIT_ACTIONS, FLEET_MODULE } from "../shared/fleet.constants.js";
import {
  LineAssignmentNotFound,
  LineAssignmentUnchanged,
  LineNotFound,
  StopNotFound,
  StopNotInAssignedLine,
  UnitAlreadyHasLineAssignment,
  UnitEnServicioCannotUnassignLine,
  UnitHasNoLineAssignment,
  UnitNotFound,
} from "../shared/fleet.errors.js";
import { EstadoUnidad, UnidadEntity } from "../unidad/unidad.entity.js";
import { AsignacionUnidadEntity } from "./asignacion-unidad.entity.js";
import { AsignacionUnidadService } from "./asignacion-unidad.service.js";

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

function makeAssignment(overrides: Partial<AsignacionUnidadEntity> = {}): AsignacionUnidadEntity {
  return {
    id: "a1",
    idUnidad: "1",
    idLinea: "10",
    fechaAsignacion: new Date("2026-01-01T00:00:00Z"),
    fechaActualizacion: new Date("2026-01-01T00:00:00Z"),
    idLineaParadaActual: null,
    fechaReporteUbicacion: null,
    ...overrides,
  };
}

describe("AsignacionUnidadService", () => {
  let unidadRepo: { findOne: AnyMock };
  let asignacionRepo: { findOne: AnyMock; create: AnyMock; save: AnyMock; remove: AnyMock };
  let paradaRepo: { findOne: AnyMock };
  let employeeRepo: { findOneOrFail: AnyMock };
  let manager: { getRepository: AnyMock };
  let dataSource: { transaction: AnyMock; getRepository: AnyMock };
  let auditRepo: { create: AnyMock };
  let lineaService: { findOne: AnyMock; listParadas: AnyMock };
  let service: AsignacionUnidadService;

  beforeEach(() => {
    unidadRepo = { findOne: jest.fn(async () => makeUnidad()) };
    asignacionRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((v: object) => v),
      // Simulates the DB assigning the generated id on insert, like a real
      // TypeORM save() does for a brand-new entity without one yet.
      save: jest.fn(
        async (v: Partial<AsignacionUnidadEntity>) =>
          ({ id: v.id ?? "a1", ...v }) as AsignacionUnidadEntity,
      ),
      remove: jest.fn(async (v: unknown) => v),
    };
    paradaRepo = { findOne: jest.fn(async () => null) };
    employeeRepo = { findOneOrFail: jest.fn(async () => ({ id: "actor-1" }) as EmployeeEntity) };
    auditRepo = { create: jest.fn(async () => ({})) };
    // Default: the requested line exists (FK validation reused from
    // InfrastructureModule's exported LineaService, design.md Decision 8).
    lineaService = {
      findOne: jest.fn(async (id: string) => ({ idLinea: id, idParqueo: "5" })),
      listParadas: jest.fn(async () => []),
    };

    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === UnidadEntity) return unidadRepo;
        if (entity === AsignacionUnidadEntity) return asignacionRepo;
        if (entity === LineaParadaEntity) return paradaRepo;
        if (entity === EmployeeEntity) return employeeRepo;
        throw new Error(`unexpected repository requested: ${String(entity)}`);
      }),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
      getRepository: jest.fn((entity: unknown) => manager.getRepository(entity)),
    };

    service = new AsignacionUnidadService(
      dataSource as unknown as DataSource,
      auditRepo as unknown as AuditRepository,
      lineaService as unknown as LineaService,
    );
  });

  describe("assign", () => {
    it("throws UnitNotFound when the unit does not exist", async () => {
      unidadRepo.findOne.mockResolvedValue(null);

      await expect(service.assign("1", { idLinea: "10" }, "actor-1")).rejects.toThrow(
        UnitNotFound,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws LineNotFound when the line does not exist (3.1.1)", async () => {
      lineaService.findOne.mockRejectedValue(new Error("Línea con ID 999 no encontrada"));

      await expect(service.assign("1", { idLinea: "999" }, "actor-1")).rejects.toThrow(
        LineNotFound,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("throws UnitAlreadyHasLineAssignment when the unit already has one (3.1.2)", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());

      await expect(service.assign("1", { idLinea: "20" }, "actor-1")).rejects.toThrow(
        UnitAlreadyHasLineAssignment,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("assigns the unit with a null location and writes an ASSIGN_LINE audit row", async () => {
      const result = await service.assign("1", { idLinea: "10" }, "actor-1");

      expect(asignacionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idUnidad: "1",
          idLinea: "10",
          idLineaParadaActual: null,
          fechaReporteUbicacion: null,
        }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.ASSIGN_LINE,
          module: FLEET_MODULE,
          entityType: "asignacion_unidad",
          entityId: "1",
          result: AUDIT_RESULTS.SUCCESS,
          detalle: { idLinea: "10" },
        }),
      );
      expect(result.idLinea).toBe("10");
    });

    it("explicitly sets fechaAsignacion and fechaActualizacion (no DB default reliance)", async () => {
      const before = Date.now();
      await service.assign("1", { idLinea: "10" }, "actor-1");
      const after = Date.now();

      const saved = asignacionRepo.save.mock.calls[0]![0] as AsignacionUnidadEntity;
      expect(saved.fechaAsignacion.getTime()).toBeGreaterThanOrEqual(before);
      expect(saved.fechaAsignacion.getTime()).toBeLessThanOrEqual(after);
      expect(saved.fechaActualizacion.getTime()).toEqual(saved.fechaAsignacion.getTime());
    });
  });

  describe("reassign", () => {
    it("throws LineAssignmentNotFound when the unit has no assignment yet", async () => {
      await expect(service.reassign("1", { idLinea: "20" }, "actor-1")).rejects.toThrow(
        LineAssignmentNotFound,
      );
    });

    it("throws LineNotFound when the new line does not exist", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());
      lineaService.findOne.mockRejectedValue(new Error("Línea con ID 999 no encontrada"));

      await expect(service.reassign("1", { idLinea: "999" }, "actor-1")).rejects.toThrow(
        LineNotFound,
      );
    });

    it("throws LineAssignmentUnchanged when reassigning to the same line (3.1.3)", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idLinea: "10" }));

      await expect(service.reassign("1", { idLinea: "10" }, "actor-1")).rejects.toThrow(
        LineAssignmentUnchanged,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("clears idLineaParadaActual and fechaReporteUbicacion on reassign (3.1.4)", async () => {
      asignacionRepo.findOne.mockResolvedValue(
        makeAssignment({
          idLinea: "10",
          idLineaParadaActual: "5",
          fechaReporteUbicacion: new Date("2026-02-01T00:00:00Z"),
        }),
      );

      const result = await service.reassign("1", { idLinea: "20" }, "actor-1");

      const saved = asignacionRepo.save.mock.calls[0]![0] as AsignacionUnidadEntity;
      expect(saved.idLineaParadaActual).toBeNull();
      expect(saved.fechaReporteUbicacion).toBeNull();
      expect(result.idLinea).toBe("20");
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.REASSIGN_LINE,
          detalle: { idLineaAnterior: "10", idLineaNueva: "20" },
        }),
      );
    });
  });

  describe("unassign", () => {
    it("throws LineAssignmentNotFound when the unit has no assignment", async () => {
      await expect(service.unassign("1", "actor-1")).rejects.toThrow(LineAssignmentNotFound);
    });

    it("throws UnitEnServicioCannotUnassignLine while the unit is EN_SERVICIO (3.1.5)", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());
      unidadRepo.findOne.mockResolvedValue(makeUnidad({ estadoUnidad: EstadoUnidad.EN_SERVICIO }));

      await expect(service.unassign("1", "actor-1")).rejects.toThrow(
        UnitEnServicioCannotUnassignLine,
      );
      expect(asignacionRepo.remove).not.toHaveBeenCalled();
    });

    it("hard-deletes the assignment and writes an UNASSIGN_LINE audit row", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idLinea: "10" }));

      await service.unassign("1", "actor-1");

      expect(asignacionRepo.remove).toHaveBeenCalled();
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.UNASSIGN_LINE,
          detalle: { idLineaAnterior: "10" },
        }),
      );
    });
  });

  describe("reportLocation", () => {
    it("throws UnitHasNoLineAssignment when the unit has no line assigned", async () => {
      await expect(
        service.reportLocation("1", { idLineaParada: "7" }, "actor-1"),
      ).rejects.toThrow(UnitHasNoLineAssignment);
    });

    it("throws StopNotFound when the stop does not exist", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idLinea: "10" }));

      await expect(
        service.reportLocation("1", { idLineaParada: "999" }, "actor-1"),
      ).rejects.toThrow(StopNotFound);
    });

    it("throws StopNotInAssignedLine when the stop belongs to a different line (3.1.6)", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idLinea: "10" }));
      paradaRepo.findOne.mockResolvedValue({ idLineaParada: "99", idLinea: "20" });

      await expect(
        service.reportLocation("1", { idLineaParada: "99" }, "actor-1"),
      ).rejects.toThrow(StopNotInAssignedLine);
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("sets fechaReporteUbicacion to new Date() explicitly, not a DB default (3.1.7)", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idLinea: "10" }));
      paradaRepo.findOne.mockResolvedValue({ idLineaParada: "7", idLinea: "10" });

      const before = Date.now();
      await service.reportLocation("1", { idLineaParada: "7" }, "actor-1");
      const after = Date.now();

      const saved = asignacionRepo.save.mock.calls[0]![0] as AsignacionUnidadEntity;
      expect(saved.idLineaParadaActual).toBe("7");
      expect(saved.fechaReporteUbicacion).not.toBeNull();
      expect(saved.fechaReporteUbicacion!.getTime()).toBeGreaterThanOrEqual(before);
      expect(saved.fechaReporteUbicacion!.getTime()).toBeLessThanOrEqual(after);
    });

    it("writes a REPORT_LOCATION audit row with detalle limited to idLineaParada", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idLinea: "10" }));
      paradaRepo.findOne.mockResolvedValue({ idLineaParada: "7", idLinea: "10" });

      await service.reportLocation("1", { idLineaParada: "7" }, "actor-1");

      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.REPORT_LOCATION,
          detalle: { idLineaParada: "7" },
        }),
      );
    });
  });

  describe("correctLocation", () => {
    it("writes a CORRECT_LOCATION audit row with before/after stop ids", async () => {
      asignacionRepo.findOne.mockResolvedValue(
        makeAssignment({ idLinea: "10", idLineaParadaActual: "7" }),
      );
      paradaRepo.findOne.mockResolvedValue({ idLineaParada: "8", idLinea: "10" });

      const result = await service.correctLocation("1", { idLineaParada: "8" }, "actor-1");

      expect(result.idLineaParadaActual).toBe("8");
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.CORRECT_LOCATION,
          detalle: { idLineaParadaAnterior: "7", idLineaParadaNueva: "8" },
        }),
      );
    });
  });

  describe("listLineStops", () => {
    it("throws UnitHasNoLineAssignment when the unit has no line", async () => {
      await expect(service.listLineStops("1")).rejects.toThrow(UnitHasNoLineAssignment);
      expect(lineaService.listParadas).not.toHaveBeenCalled();
    });

    it("maps the assigned line's stops (already ordered by LineaService) to the stop DTO", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idLinea: "10" }));
      lineaService.listParadas.mockResolvedValue([
        { idLineaParada: "21", idParada: "5", orden: 1, parada: { idParada: 5, nombreParada: "Centro" } },
        { idLineaParada: "22", idParada: "6", orden: 2, parada: { idParada: 6, nombreParada: "Trébol" } },
      ]);

      const result = await service.listLineStops("1");

      expect(asignacionRepo.findOne).toHaveBeenCalledWith({ where: { idUnidad: "1" } });
      expect(lineaService.listParadas).toHaveBeenCalledWith("10");
      expect(result).toEqual([
        { idLineaParada: "21", idParada: "5", nombre: "Centro", orden: 1 },
        { idLineaParada: "22", idParada: "6", nombre: "Trébol", orden: 2 },
      ]);
    });

    it("re-raises a missing line as LineNotFound", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idLinea: "10" }));
      lineaService.listParadas.mockRejectedValue(new Error("not found"));

      await expect(service.listLineStops("1")).rejects.toThrow(LineNotFound);
    });
  });
});
