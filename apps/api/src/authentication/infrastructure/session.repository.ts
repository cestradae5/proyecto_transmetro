import type { EntityManager } from "typeorm";

import { EmployeeEntity } from "../entities/employee.entity.js";
import { SessionEntity } from "../entities/session.entity.js";

export interface NewSessionRecord {
  employee: EmployeeEntity;
  expiresAt: Date;
  tokenHash: string;
}

export class SessionRepository {
  async create(
    manager: EntityManager,
    record: NewSessionRecord,
  ): Promise<SessionEntity> {
    const repository = manager.getRepository(SessionEntity);

    return repository.save(repository.create(record));
  }
}
