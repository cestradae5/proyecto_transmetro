// AsignacionEstacionService tests (mocked EntityManager/repos), same dispatcher
// style as asignacion-piloto.service.spec.ts: assertions check error classes.

import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../../authentication/entities/employee.entity.js";
import type { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import { EstacionEntity } from "../../infrastructure/estacion/estacion.entity.js";
import { FLEET_AUDIT_ACTIONS, FLEET_MODULE } from "../shared/fleet.constants.js";
import {
  AssignmentNotFound,
  EmployeeNotFound,
  EmployeeNotStationOperator,
  OperatorAlreadyAssigned,
  StationNotFound,
} from "../shared/fleet.errors.js";
import type { PilotEligibilityLookup } from "../shared/pilot-eligibility.lookup.js";
import { AsignacionEstacionEntity, ESTADO_ASIGNACION } from "./asignacion-estacion.entity.js";
import { AsignacionEstacionService } from "./asignacion-estacion.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

function makeAssignment(overrides: Partial<AsignacionEstacionEntity> = {}): AsignacionEstacionEntity {
  return {
    id: "a1",
    idEmpleado: "op-1",
    idEstacion: "10",
    estadoAsignacion: ESTADO_ASIGNACION.ACTIVA,
    fechaAsignacion: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("AsignacionEstacionService", () => {
  let asignacionRepo: { findOne: AnyMock; create: AnyMock; save: AnyMock };
  let estacionRepo: { findOne: AnyMock };
  let employeeRepo: { findOne: AnyMock; findOneOrFail: AnyMock };
  let manager: { getRepository: AnyMock };
  let dataSource: { transaction: AnyMock; getRepository: AnyMock };
  let auditRepo: { create: AnyMock };
  let lookup: { findRoleCode: AnyMock };
  let qb: Record<string, AnyMock>;
  let service: AsignacionEstacionService;

  beforeEach(() => {
    asignacionRepo = {
      findOne: jest.fn(async () => null),
      create: jest.fn((v: object) => v),
      save: jest.fn(
        async (v: Partial<AsignacionEstacionEntity>) =>
          ({ id: v.id ?? "a1", ...v }) as AsignacionEstacionEntity,
      ),
    };
    estacionRepo = {
      findOne: jest.fn(async () => ({ idEstacion: 10, nombreEstacion: "Central" })),
    };
    employeeRepo = {
      findOne: jest.fn(
        async () =>
          ({ id: "op-1", name: "Ana", status: EMPLOYEE_STATUSES.ACTIVE }) as EmployeeEntity,
      ),
      findOneOrFail: jest.fn(async () => ({ id: "actor-1" }) as EmployeeEntity),
    };
    auditRepo = { create: jest.fn(async () => ({})) };
    lookup = { findRoleCode: jest.fn(async () => ({ id: "op-1", roleCode: "OPERADOR_ESTACION" })) };

    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === AsignacionEstacionEntity) return asignacionRepo;
        if (entity === EstacionEntity) return estacionRepo;
        if (entity === EmployeeEntity) return employeeRepo;
        throw new Error(`unexpected repository requested: ${String(entity)}`);
      }),
    };

    qb = {};
    for (const m of ["innerJoin", "select", "addSelect", "where", "andWhere", "orderBy"]) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn(async () => [
      {
        idAsignacionEstacion: "1",
        idEmpleado: "op-1",
        nombreEmpleado: "Ana",
        idEstacion: "10",
        nombreEstacion: "Central",
        estadoAsignacion: "ACTIVA",
        fechaAsignacion: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
      getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
    };

    service = new AsignacionEstacionService(
      dataSource as unknown as DataSource,
      auditRepo as unknown as AuditRepository,
      lookup as unknown as PilotEligibilityLookup,
    );
  });

  describe("list", () => {
    it("returns only ACTIVA assignments and applies no station filter by default", async () => {
      const result = await service.list();

      expect(qb.where).toHaveBeenCalledWith(expect.any(String), { activa: "ACTIVA" });
      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(result).toEqual([
        expect.objectContaining({ idAsignacionEstacion: "1", nombreEmpleado: "Ana", idEstacion: "10" }),
      ]);
    });

    it("filters by idEstacion when provided", async () => {
      await service.list("10");

      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), { idEstacion: "10" });
    });
  });

  describe("assign", () => {
    const dto = { idEmpleado: "op-1", idEstacion: "10" };

    it("throws StationNotFound when the station does not exist", async () => {
      estacionRepo.findOne.mockResolvedValue(null);

      await expect(service.assign(dto, "actor-1")).rejects.toThrow(StationNotFound);
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("throws EmployeeNotFound when the employee does not exist", async () => {
      lookup.findRoleCode.mockResolvedValue(null);

      await expect(service.assign(dto, "actor-1")).rejects.toThrow(EmployeeNotFound);
    });

    it("throws EmployeeNotStationOperator when the role is not OPERADOR_ESTACION", async () => {
      lookup.findRoleCode.mockResolvedValue({ id: "op-1", roleCode: "PILOTO" });

      await expect(service.assign(dto, "actor-1")).rejects.toThrow(EmployeeNotStationOperator);
    });

    it("throws EmployeeNotStationOperator when the employee is inactive", async () => {
      employeeRepo.findOne.mockResolvedValue({ id: "op-1", name: "Ana", status: "INACTIVO" });

      await expect(service.assign(dto, "actor-1")).rejects.toThrow(EmployeeNotStationOperator);
    });

    it("throws OperatorAlreadyAssigned when an ACTIVA assignment exists", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());

      await expect(service.assign(dto, "actor-1")).rejects.toThrow(OperatorAlreadyAssigned);
      expect(asignacionRepo.save).not.toHaveBeenCalled();
    });

    it("looks only for ACTIVA rows, so an INACTIVA history row never blocks and a new row is inserted", async () => {
      const result = await service.assign(dto, "actor-1");

      expect(asignacionRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { idEmpleado: "op-1", estadoAsignacion: "ACTIVA" },
        }),
      );
      expect(asignacionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idEmpleado: "op-1",
          idEstacion: "10",
          estadoAsignacion: "ACTIVA",
          fechaAsignacion: expect.any(Date),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          idEmpleado: "op-1",
          nombreEmpleado: "Ana",
          idEstacion: "10",
          nombreEstacion: "Central",
          estadoAsignacion: "ACTIVA",
        }),
      );
    });

    it("writes an ASSIGN_STATION audit entry", async () => {
      await service.assign(dto, "actor-1");

      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.ASSIGN_STATION,
          module: FLEET_MODULE,
          entityType: "asignacion_estacion",
          result: AUDIT_RESULTS.SUCCESS,
          detalle: { idEmpleadoOperador: "op-1", idEstacion: "10" },
        }),
      );
    });
  });

  describe("reassign", () => {
    it("throws AssignmentNotFound when there is no ACTIVA assignment with that id", async () => {
      await expect(service.reassign("a1", { idEstacion: "11" }, "actor-1")).rejects.toThrow(
        AssignmentNotFound,
      );
    });

    it("throws StationNotFound when the target station does not exist", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());
      estacionRepo.findOne.mockResolvedValue(null);

      await expect(service.reassign("a1", { idEstacion: "11" }, "actor-1")).rejects.toThrow(
        StationNotFound,
      );
    });

    it("returns the assignment unchanged, without write or audit, for the same station", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());

      const result = await service.reassign("a1", { idEstacion: "10" }, "actor-1");

      expect(result.idEstacion).toBe("10");
      expect(asignacionRepo.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("moves the same row to the new station and audits REASSIGN_STATION", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());
      estacionRepo.findOne.mockResolvedValue({ idEstacion: 11, nombreEstacion: "Norte" });

      const result = await service.reassign("a1", { idEstacion: "11" }, "actor-1");

      expect(asignacionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a1", idEstacion: "11" }),
      );
      expect(result).toEqual(
        expect.objectContaining({ idAsignacionEstacion: "a1", idEstacion: "11", nombreEstacion: "Norte" }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.REASSIGN_STATION,
          entityId: "a1",
          detalle: {
            idEmpleadoOperador: "op-1",
            idEstacionAnterior: "10",
            idEstacionNueva: "11",
          },
        }),
      );
    });
  });

  describe("unassign", () => {
    it("throws AssignmentNotFound when there is no ACTIVA assignment with that id", async () => {
      await expect(service.unassign("a1", "actor-1")).rejects.toThrow(AssignmentNotFound);
    });

    it("sets the row INACTIVA (no delete) and audits UNASSIGN_STATION", async () => {
      asignacionRepo.findOne.mockResolvedValue(makeAssignment());

      await service.unassign("a1", "actor-1");

      expect(asignacionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "a1", estadoAsignacion: "INACTIVA" }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({
          action: FLEET_AUDIT_ACTIONS.UNASSIGN_STATION,
          entityId: "a1",
          detalle: { idEmpleadoOperador: "op-1", idEstacion: "10" },
        }),
      );
    });
  });
});
