// Repositorio de sesiones: persistencia de tbl_sesion
// Operaciones usadas por AuthenticationService dentro de transacciones (create, deleteByEmployeeId)
// y fuera de transacción para /me (findByHash con relations completas)

import type { EntityManager } from "typeorm";
import { DataSource } from "typeorm";

import { EmployeeEntity } from "../entities/employee.entity.js";
import { SessionEntity } from "../entities/session.entity.js";

export interface NewSessionRecord {
  employee: EmployeeEntity;   // relación many-to-one hacia tbl_empleado
  expiresAt: Date;            // expiración fija (now + 12h)
  tokenHash: string;          // SHA-256 hex (64 chars) — token crudo NUNCA se guarda
}

export class SessionRepository {
  // dataSource inyectado para findByHash fuera de transacción
  constructor(private readonly dataSource: DataSource) {}

  // Inserta nueva sesión dentro de la transacción provista por el service
  async create(
    manager: EntityManager,
    record: NewSessionRecord,
  ): Promise<SessionEntity> {
    const repository = manager.getRepository(SessionEntity);
    return repository.save(repository.create(record));
  }

  // Borra TODAS las sesiones de un empleado (single-session policy)
  // Se llama dentro de la misma transacción que create para reemplazo atómico
  async deleteByEmployeeId(
    manager: EntityManager,
    employeeId: string,
  ): Promise<void> {
    await manager.getRepository(SessionEntity).delete({ employee: { id: employeeId } });
  }

  // Busca sesión por hash para /me y logout
  // Carga relations completas (employee → role → permissions) para armar MeResult
  async findByHash(tokenHash: string): Promise<SessionEntity | null> {
    const repository = this.dataSource.getRepository(SessionEntity);
    return repository.findOne({
      where: { tokenHash },
      relations: ["employee", "employee.role", "employee.role.permissions"],
    });
  }
}
