import type { EntityManager } from "typeorm";

import {
  type AuditResult,
  AuditLogEntity,
} from "../entities/audit-log.entity.js";
import { EmployeeEntity } from "../entities/employee.entity.js";

export interface NewAuditRecord {
  action: string;
  detalle?: Record<string, unknown> | null;
  // Null only for a failed login: the attempt is recorded with no employee
  // and no entity id (tbl_bitacora.id_empleado/entidad_id are nullable).
  employee: EmployeeEntity | null;
  entityId: string | null;
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
