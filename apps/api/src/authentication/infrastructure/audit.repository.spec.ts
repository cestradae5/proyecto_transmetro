// Unit coverage for AuditRepository's optional detalle JSONB support
// (design.md Decision 4/5): fleet mutations need a business payload stored
// alongside the audit row; existing auth callers must remain valid with no
// detalle field at all (backward compatibility, spec "existing auth audit
// writes remain valid").

import { jest } from "@jest/globals";
import type { EntityManager } from "typeorm";
import { getMetadataArgsStorage } from "typeorm";

import { AuditLogEntity, AUDIT_RESULTS } from "../entities/audit-log.entity.js";
import { EmployeeEntity } from "../entities/employee.entity.js";
import { AuditRepository } from "./audit.repository.js";

function columnNames(target: Function): string[] {
  return getMetadataArgsStorage()
    .columns.filter((column) => column.target === target)
    .map((column) => column.options.name?.toString() ?? column.propertyName);
}

describe("AuditRepository — optional detalle JSONB", () => {
  it("declares a nullable detalle JSONB column on AuditLogEntity", () => {
    expect(columnNames(AuditLogEntity)).toContain("detalle");
  });

  it("persists a detalle payload for a fleet-originated audit record", async () => {
    const create = jest.fn((value: object) => value);
    const save = jest.fn(async (value: object) => value);
    const manager = {
      getRepository: jest.fn().mockReturnValue({ create, save }),
    } as unknown as EntityManager;
    const employee = { id: "7" } as EmployeeEntity;

    await new AuditRepository().create(manager, {
      action: "assign_pilot",
      detalle: { idEmpleadoPiloto: "7" },
      employee,
      entityId: "1",
      entityType: "asignacion_piloto",
      module: "fleet",
      result: AUDIT_RESULTS.SUCCESS,
    });

    expect(manager.getRepository).toHaveBeenCalledWith(AuditLogEntity);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ detalle: { idEmpleadoPiloto: "7" } }),
    );
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps detalle optional so a pre-existing auth call with no detalle field remains valid", async () => {
    const create = jest.fn((value: object) => value);
    const save = jest.fn(async (value: object) => value);
    const manager = {
      getRepository: jest.fn().mockReturnValue({ create, save }),
    } as unknown as EntityManager;
    const employee = { id: "3" } as EmployeeEntity;

    await new AuditRepository().create(manager, {
      action: "LOGIN",
      employee,
      entityId: "3",
      entityType: "jwt",
      module: "authentication",
      result: AUDIT_RESULTS.SUCCESS,
    });

    const savedRecord = create.mock.calls[0]![0] as { detalle?: unknown };
    expect(savedRecord.detalle).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
