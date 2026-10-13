import { Injectable } from "@nestjs/common";
import type { EntityManager } from "typeorm";

import { AUDIT_RESULTS } from "../../authentication/entities/audit-log.entity.js";
import { EmployeeEntity } from "../../authentication/entities/employee.entity.js";
import { AuditRepository } from "../../authentication/infrastructure/audit.repository.js";
import {
  INFRASTRUCTURE_MODULE,
  type InfrastructureAuditAction,
  type InfrastructureEntityType,
} from "./infrastructure-audit.constants.js";

export interface InfrastructureAuditParams {
  action: InfrastructureAuditAction;
  entityType: InfrastructureEntityType;
  entityId: string;
  detalle?: Record<string, unknown> | null;
}

// Writes one Infrastructure audit row (resultado EXITOSO) inside the caller's
// transaction, so an audited mutation and its audit row commit or roll back
// together (fleet/personal precedent). The actor is the authenticated employee.
@Injectable()
export class InfrastructureAuditService {
  constructor(private readonly auditRepo: AuditRepository) {}

  async record(
    manager: EntityManager,
    actorEmployeeId: string,
    params: InfrastructureAuditParams,
  ): Promise<void> {
    const employee = await manager
      .getRepository(EmployeeEntity)
      .findOneOrFail({ where: { id: actorEmployeeId } });
    await this.auditRepo.create(manager, {
      action: params.action,
      employee,
      entityId: params.entityId,
      entityType: params.entityType,
      module: INFRASTRUCTURE_MODULE,
      result: AUDIT_RESULTS.SUCCESS,
      detalle: params.detalle ?? null,
    });
  }
}
