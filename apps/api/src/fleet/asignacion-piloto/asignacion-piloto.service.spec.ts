// AsignacionPilotoService tests (mocked EntityManager/repos). Mirrors
// AsignacionUnidadService's own spec structure: a dispatcher
// `manager.getRepository(X)` returns a small per-entity mock, assertions
// check thrown error *classes* (never messages), and `dataSource.transaction`
// just invokes the callback with the mocked manager.
//
// reassign()'s model: per spec.md "Reassign Pilot to a Different Unit",
// :unitId in the route is the TARGET unit; the existing assignment being
// moved is located by the pilot's own employee id (dto.idEmpleado), not by
// unitId. See asignacion-piloto.service.ts's module comment for the full
// resolution of this design.md/tasks.md ambiguity.

import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";
import type { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import type { AsignacionUnidadResponseDto } from "../asignacion-unidad/dto/asignacion-unidad-response.dto.js";
import type { AsignacionUnidadService } from "../asignacion-unidad/asignacion-unidad.service.js";
import { FLEET_AUDIT_ACTIONS, FLEET_MODULE } from "../shared/fleet.constants.js";
import {
  EmployeeNotFound,
  PilotAlreadyAssignedToUnit,
  PilotAssignmentNotFound,
  PilotAssignmentUnchanged,
  PilotHasNoUnitAssigned,
  PilotRoleRequired,
  UnitAlreadyHasPilotAssignment,
  UnitEnServicioCannotReassignPilot,
  UnitEnServicioCannotUnassignPilot,
  UnitNotFound,
} from "../shared/fleet.errors.js";
import type { PilotEligibilityLookup } from "../shared/pilot-eligibility.lookup.js";
import { EstadoUnidad, UnidadEntity } from "../unidad/unidad.entity.js";
import type { UnidadResponseDto } from "../unidad/dto/unidad-response.dto.js";
import type { UnidadService } from "../unidad/unidad.service.js";
import { AsignacionPilotoEntity } from "./asignacion-piloto.entity.js";
import { AsignacionPilotoService } from "./asignacion-piloto.service.js";

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

function makeAssignment(overrides: Partial<AsignacionPilotoEntity> = {}): AsignacionPilotoEntity {
  return {
    id: "ap1",
    idEmpleado: "piloto-1",
    idUnidad: "1",
    fechaAsignacion: new Date("2026-01-01T00:00:00Z"),
    fechaActualizacion: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("AsignacionPilotoService", () => {
  let unidadRepo: { findOne: AnyMock };
  let asignacionRepo: { findOne: AnyMock; create: AnyMock; save: AnyMock; remove: AnyMock };
  let employeeRepo: { findOne: AnyMock; findOneOrFail: AnyMock };
  let manager: { getRepository: AnyMock };
  let dataSource: { transaction: AnyMock; getRepository: AnyMock };
  let auditRepo: { create: AnyMock };
  let pilotEligibilityLookup: { findRoleCode: AnyMock };
  let unidadService: { findOne: AnyMock };
  let asignacionUnidadService: { reportLocation: AnyMock; listLineStops: AnyMock };
  let service: AsignacionPilotoService;

  beforeEach(() => {
    unidadRepo = { findOne: jest.fn(async () => makeUnidad()) };
    asignacionRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((v: object) => v),
      save: jest.fn(
        async (v: Partial<AsignacionPilotoEntity>) =>
          ({ id: v.id ?? "ap1", ...v }) as AsignacionPilotoEntity,
      ),
      remove: jest.fn(async (v: unknown) => v),
    };
    employeeRepo = {
      findOne: jest.fn(async () => ({ id: "piloto-1", name: "Juan Pérez" }) as EmployeeEntity),
      findOneOrFail: jest.fn(async () => ({ id: "actor-1" }) as EmployeeEntity),
    };
    auditRepo = { create: jest.fn(async () => ({})) };
    pilotEligibilityLookup = {
      findRoleCode: jest.fn(async () => ({ id: "piloto-1", roleCode: "PILOTO" })),
    };
    unidadService = {
      findOne: jest.fn(async (id: string) => ({ idUnidad: id }) as UnidadResponseDto),
    };
    asignacionUnidadService = {
      reportLocation: jest.fn(async () => ({ idLineaParadaActual: "7" }) as AsignacionUnidadResponseDto),
      listLineStops: jest.fn(async () => [
        { idLineaParada: "3", idParada: "9", nombre: "Centro", orden: 1 },
      ]),
    };

    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === UnidadEntity) return unidadRepo;
        if (entity === AsignacionPilotoEntity) return asignacionRepo;
        if (entity === EmployeeEntity) return employeeRepo;
        throw new Error(`unexpected repository requested: ${String(entity)}`);
      }),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === AsignacionPilotoEntity) return asignacionRepo;
        throw new Error(`unexpected non-transactional repository requested: ${String(entity)}`);
      }),
    };

    service = new AsignacionPilotoService(
      dataSource as unknown as DataSource,
      auditRepo as unknown as AuditRepository,
      pilotEligibilityLookup as unknown as PilotEligibilityLookup,
      unidadService as unknown as UnidadService,
      asignacionUnidadService as unknown as AsignacionUnidadService,
    );
  });

  describe("assign", () => {
    it("throws UnitNotFound when the unit does not exist", async () => {
      unidadRepo.findOne.mockResolvedValue(null);

      await expect(service.assign("1", { idEmpleado: "piloto-1" }, "actor-1")).rejects.toThrow(
        UnitNotFound,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws EmployeeNotFound when the employee does not exist", async () => {
      pilotEligibilityLookup.findRoleCode.mockResolvedValue(null);

      await expect(service.assign("1", { idEmpleado: "999" }, "actor-1")).rejects.toThrow(
        EmployeeNotFound,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("throws PilotRoleRequired when the employee is not a PILOTO (4.1.1)", async () => {
      pilotEligibilityLookup.findRoleCode.mockResolvedValue({ id: "e1", roleCode: "GERENTE" });

      await expect(service.assign("1", { idEmpleado: "e1" }, "actor-1")).rejects.toThrow(
        PilotRoleRequired,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws PilotAlreadyAssignedToUnit when the pilot already has an assignment (4.1.2)", async () => {
      asignacionRepo.findOne.mockResolvedValueOnce(makeAssignment({ idUnidad: "99" }));

      await expect(service.assign("1", { idEmpleado: "piloto-1" }, "actor-1")).rejects.toThrow(
        PilotAlreadyAssignedToUnit,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws UnitAlreadyHasPilotAssignment when the unit already has a pilot (4.1.3)", async () => {
      asignacionRepo.findOne
        .mockResolvedValueOnce(null) // pilot cardinality check: free
        .mockResolvedValueOnce(makeAssignment({ idEmpleado: "other-pilot" })); // unit cardinality check: taken

      await expect(service.assign("1", { idEmpleado: "piloto-1" }, "actor-1")).rejects.toThrow(
        UnitAlreadyHasPilotAssignment,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("assigns the pilot and writes an ASSIGN_PILOT audit row", async () => {
      const result = await service.assign("1", { idEmpleado: "piloto-1" }, "actor-1");

      expect(asignacionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ idEmpleado: "piloto-1", idUnidad: "1" }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.ASSIGN_PILOT,
          module: FLEET_MODULE,
          entityType: "asignacion_piloto",
          entityId: "1",
          result: AUDIT_RESULTS.SUCCESS,
          detalle: { idEmpleadoPiloto: "piloto-1" },
        }),
      );
      expect(result.idEmpleado).toBe("piloto-1");
      expect(result.nombreEmpleado).toBe("Juan Pérez");
    });

    it("explicitly sets fechaAsignacion and fechaActualizacion to new Date(), not a DB default (4.1.9)", async () => {
      const before = Date.now();
      await service.assign("1", { idEmpleado: "piloto-1" }, "actor-1");
      const after = Date.now();

      const saved = asignacionRepo.save.mock.calls[0]![0] as AsignacionPilotoEntity;
      expect(saved.fechaAsignacion.getTime()).toBeGreaterThanOrEqual(before);
      expect(saved.fechaAsignacion.getTime()).toBeLessThanOrEqual(after);
      expect(saved.fechaActualizacion.getTime()).toEqual(saved.fechaAsignacion.getTime());
    });
  });

  describe("reassign", () => {
    it("throws EmployeeNotFound when the target pilot does not exist", async () => {
      pilotEligibilityLookup.findRoleCode.mockResolvedValue(null);

      await expect(service.reassign("2", { idEmpleado: "999" }, "actor-1")).rejects.toThrow(
        EmployeeNotFound,
      );
    });

    it("throws PilotRoleRequired when the target employee is not a PILOTO", async () => {
      pilotEligibilityLookup.findRoleCode.mockResolvedValue({ id: "e1", roleCode: "GERENTE" });

      await expect(service.reassign("2", { idEmpleado: "e1" }, "actor-1")).rejects.toThrow(
        PilotRoleRequired,
      );
    });

    it("throws PilotAssignmentNotFound when the pilot has no existing assignment to move", async () => {
      asignacionRepo.findOne.mockResolvedValue(null);

      await expect(service.reassign("2", { idEmpleado: "piloto-1" }, "actor-1")).rejects.toThrow(
        PilotAssignmentNotFound,
      );
    });

    it("throws UnitNotFound when the target unit does not exist", async () => {
      asignacionRepo.findOne.mockResolvedValueOnce(makeAssignment({ idUnidad: "1" }));
      unidadRepo.findOne.mockResolvedValueOnce(null); // target unit lookup

      await expect(service.reassign("999", { idEmpleado: "piloto-1" }, "actor-1")).rejects.toThrow(
        UnitNotFound,
      );
    });

    it("throws PilotAssignmentUnchanged when reassigning to the same unit (4.1.4)", async () => {
      asignacionRepo.findOne.mockResolvedValueOnce(makeAssignment({ idUnidad: "1" }));
      unidadRepo.findOne.mockResolvedValueOnce(makeUnidad({ id: "1" })); // target unit exists

      await expect(service.reassign("1", { idEmpleado: "piloto-1" }, "actor-1")).rejects.toThrow(
        PilotAssignmentUnchanged,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws UnitEnServicioCannotReassignPilot when the pilot's current unit is EN_SERVICIO (4.1.5)", async () => {
      asignacionRepo.findOne.mockResolvedValueOnce(makeAssignment({ idUnidad: "1" })); // current: unit 1
      unidadRepo.findOne
        .mockResolvedValueOnce(makeUnidad({ id: "2" })) // target unit (2) exists
        .mockResolvedValueOnce(makeUnidad({ id: "1", estadoUnidad: EstadoUnidad.EN_SERVICIO })); // current unit (1) is EN_SERVICIO

      await expect(service.reassign("2", { idEmpleado: "piloto-1" }, "actor-1")).rejects.toThrow(
        UnitEnServicioCannotReassignPilot,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws UnitAlreadyHasPilotAssignment when the target unit already has a different pilot", async () => {
      asignacionRepo.findOne
        .mockResolvedValueOnce(makeAssignment({ idUnidad: "1" })) // current assignment
        .mockResolvedValueOnce(makeAssignment({ idUnidad: "2", idEmpleado: "other-pilot" })); // target unit cardinality check
      unidadRepo.findOne
        .mockResolvedValueOnce(makeUnidad({ id: "2" })) // target unit exists
        .mockResolvedValueOnce(makeUnidad({ id: "1" })); // current unit, not EN_SERVICIO

      await expect(service.reassign("2", { idEmpleado: "piloto-1" }, "actor-1")).rejects.toThrow(
        UnitAlreadyHasPilotAssignment,
      );
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("moves the pilot from the current unit to the target unit and writes a REASSIGN_PILOT audit row", async () => {
      asignacionRepo.findOne
        .mockResolvedValueOnce(makeAssignment({ idUnidad: "1", idEmpleado: "piloto-1" })) // current assignment
        .mockResolvedValueOnce(null); // target unit cardinality check: free
      unidadRepo.findOne
        .mockResolvedValueOnce(makeUnidad({ id: "2" })) // target unit exists
        .mockResolvedValueOnce(makeUnidad({ id: "1" })); // current unit, not EN_SERVICIO

      const result = await service.reassign("2", { idEmpleado: "piloto-1" }, "actor-1");

      const saved = asignacionRepo.save.mock.calls[0]![0] as AsignacionPilotoEntity;
      expect(saved.idUnidad).toBe("2");
      expect(result.idUnidad).toBe("2");
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.REASSIGN_PILOT,
          entityId: "2",
          detalle: { idEmpleadoPiloto: "piloto-1", idUnidadAnterior: "1", idUnidadNueva: "2" },
        }),
      );
    });
  });

  describe("unassign", () => {
    it("throws PilotAssignmentNotFound when the unit has no pilot assignment", async () => {
      await expect(service.unassign("1", "actor-1")).rejects.toThrow(PilotAssignmentNotFound);
    });

    it("throws UnitEnServicioCannotUnassignPilot while the unit is EN_SERVICIO (4.1.6)", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());
      unidadRepo.findOne.mockResolvedValue(makeUnidad({ estadoUnidad: EstadoUnidad.EN_SERVICIO }));

      await expect(service.unassign("1", "actor-1")).rejects.toThrow(
        UnitEnServicioCannotUnassignPilot,
      );
      expect(asignacionRepo.remove).not.toHaveBeenCalled();
    });

    it("hard-deletes the assignment and writes an UNASSIGN_PILOT audit row", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idEmpleado: "piloto-1" }));

      await service.unassign("1", "actor-1");

      expect(asignacionRepo.remove).toHaveBeenCalled();
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.UNASSIGN_PILOT,
          entityId: "1",
          detalle: { idEmpleadoPilotoAnterior: "piloto-1" },
        }),
      );
    });
  });

  describe("getOwnUnit", () => {
    it("throws PilotHasNoUnitAssigned when the pilot has no assignment (4.1.7)", async () => {
      asignacionRepo.findOne.mockResolvedValue(null);

      await expect(service.getOwnUnit("employee-1")).rejects.toThrow(PilotHasNoUnitAssigned);
      expect(unidadService.findOne).not.toHaveBeenCalled();
    });

    it("resolves the pilot's unit via UnidadService.findOne when an assignment exists", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idUnidad: "7", idEmpleado: "employee-1" }));

      const result = await service.getOwnUnit("employee-1");

      expect(unidadService.findOne).toHaveBeenCalledWith("7");
      expect(result.idUnidad).toBe("7");
    });
  });

  describe("getOwnStops", () => {
    it("throws PilotHasNoUnitAssigned when the pilot has no assignment", async () => {
      asignacionRepo.findOne.mockResolvedValue(null);

      await expect(service.getOwnStops("employee-1")).rejects.toThrow(PilotHasNoUnitAssigned);
      expect(asignacionUnidadService.listLineStops).not.toHaveBeenCalled();
    });

    it("delegates to AsignacionUnidadService.listLineStops with the pilot's own unit", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idUnidad: "7", idEmpleado: "employee-1" }));

      const result = await service.getOwnStops("employee-1");

      expect(asignacionRepo.findOne).toHaveBeenCalledWith({ where: { idEmpleado: "employee-1" } });
      expect(asignacionUnidadService.listLineStops).toHaveBeenCalledWith("7");
      expect(result).toEqual([{ idLineaParada: "3", idParada: "9", nombre: "Centro", orden: 1 }]);
    });
  });

  describe("reportOwnLocation", () => {
    it("throws PilotHasNoUnitAssigned when the pilot has no assignment", async () => {
      asignacionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reportOwnLocation("employee-1", { idLineaParada: "7" }),
      ).rejects.toThrow(PilotHasNoUnitAssigned);
      expect(asignacionUnidadService.reportLocation).not.toHaveBeenCalled();
    });

    it("delegates to AsignacionUnidadService.reportLocation with the pilot's own unit and employee id", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment({ idUnidad: "7", idEmpleado: "employee-1" }));

      await service.reportOwnLocation("employee-1", { idLineaParada: "7" });

      expect(asignacionUnidadService.reportLocation).toHaveBeenCalledWith(
        "7",
        { idLineaParada: "7" },
        "employee-1",
      );
    });
  });
});
