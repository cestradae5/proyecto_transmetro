import { jest } from "@jest/globals";
import type { EntityManager } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";
import type { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import {
  INFRASTRUCTURE_AUDIT_ACTIONS,
  INFRASTRUCTURE_ENTITY_TYPES,
  INFRASTRUCTURE_MODULE,
} from "./infrastructure-audit.constants.js";
import { InfrastructureAuditService } from "./infrastructure-audit.service.js";

describe("InfrastructureAuditService", () => {
  const actor = { id: "7" } as EmployeeEntity;

  function setup() {
    const findOneOrFail = jest.fn(async () => actor);
    const manager = {
      getRepository: jest.fn(() => ({ findOneOrFail })),
    } as unknown as EntityManager;
    const auditRepo = { create: jest.fn(async () => ({})) };
    const service = new InfrastructureAuditService(
      auditRepo as unknown as AuditRepository,
    );
    return { service, manager, auditRepo, findOneOrFail };
  }

  it("loads the acting employee and writes a SUCCESS infrastructure row inside the caller's manager", async () => {
    const { service, manager, auditRepo, findOneOrFail } = setup();

    await service.record(manager, "7", {
      action: INFRASTRUCTURE_AUDIT_ACTIONS.CREATE,
      entityType: INFRASTRUCTURE_ENTITY_TYPES.MUNICIPALIDAD,
      entityId: "42",
      detalle: { nombre: "X" },
    });

    expect(findOneOrFail).toHaveBeenCalledWith({ where: { id: "7" } });
    expect(auditRepo.create).toHaveBeenCalledWith(manager, {
      action: "create",
      employee: actor,
      entityId: "42",
      entityType: "municipalidad",
      module: INFRASTRUCTURE_MODULE,
      result: AUDIT_RESULTS.SUCCESS,
      detalle: { nombre: "X" },
    });
  });

  it("defaults detalle to null when omitted", async () => {
    const { service, manager, auditRepo } = setup();

    await service.record(manager, "7", {
      action: INFRASTRUCTURE_AUDIT_ACTIONS.REMOVE,
      entityType: INFRASTRUCTURE_ENTITY_TYPES.LINEA,
      entityId: "1",
    });

    expect(auditRepo.create.mock.calls[0][1].detalle).toBeNull();
  });
});
