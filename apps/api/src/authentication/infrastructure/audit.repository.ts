import type { EntityManager } from "typeorm";

import {
  type AuditResult,
  AuditLogEntity,
} from "../entities/audit-log.entity.js";
import { EmployeeEntity } from "../entities/employee.entity.js";

export interface NewAuditRecord {
  action: string;
  employee: EmployeeEntity;
  entityId: string;
  entityType: string;
  module: string;
  result: AuditResult;
}

export class AuditRepository {
  async create(
    manager: EntityManager,
    record: NewAuditRecord,
  ): Promise<AuditLogEntity> {
    const repository = manager.getRepository(AuditLogEntity);

    return repository.save(repository.create(record));
  }
}
