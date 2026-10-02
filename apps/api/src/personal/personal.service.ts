import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  type EntityManager,
  ILike,
  Not,
  QueryFailedError,
  type FindOptionsWhere,
  Repository,
} from "typeorm";

import { AUDIT_RESULTS } from "../authentication/entities/audit-log.entity.js";
import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../authentication/entities/employee.entity.js";
import { RoleEntity } from "../authentication/entities/role.entity.js";
import { AuditRepository } from "../authentication/infrastructure/audit.repository.js";
import type { AuditActor } from "../fleet/shared/fleet.contracts.js";
import type { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import { EmployeeResponseDto } from "./dto/employee-response.dto.js";
import type { QueryEmployeesDto } from "./dto/query-employees.dto.js";
import type { UpdateEmployeeDto } from "./dto/update-employee.dto.js";
import {
  PERSONAL_AUDIT_ACTIONS,
  PERSONAL_ENTITY_TYPE,
  PERSONAL_MODULE,
  type PersonalAuditAction,
} from "./personal.constants.js";

/** Pure mapper from an entity (with its `role` relation loaded) to the API response. */
export function toEmployeeResponse(entity: EmployeeEntity): EmployeeResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    email: entity.email,
    status: entity.status,
    roleId: entity.role.id,
    roleCode: entity.role.code,
    roleName: entity.role.name,
    phone: entity.phone ?? null,
    dpi: entity.dpi ?? null,
    hireDate: entity.hireDate ?? null,
    address: entity.address ?? null,
    licenseNumber: entity.licenseNumber ?? null,
    educationHistory: entity.educationHistory ?? null,
    languages: entity.languages ?? null,
  };
}

const NON_NULLABLE_FIELDS: ReadonlySet<string> = new Set(["name", "status", "dpi"]);

/** Escapes LIKE wildcards so the search term is matched literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}

const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

/** True when `error` is a TypeORM query failure carrying the given Postgres error code. */
function isPgError(error: unknown, code: string): error is QueryFailedError {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === code
  );
}

/** Picks the conflict message for a unique violation from the constraint metadata. */
function uniqueViolationMessage(error: QueryFailedError): string {
  const driverError = error.driverError as { constraint?: string; detail?: string };
  const hint = `${driverError.constraint ?? ""} ${driverError.detail ?? ""}`.toLowerCase();
  if (hint.includes("dpi")) {
    return "Ya existe un empleado con el DPI indicado";
  }
  if (hint.includes("email")) {
    return "Ya existe un empleado con el correo indicado";
  }
  return "Ya existe un empleado con los mismos datos únicos (correo o DPI)";
}

@Injectable()
export class PersonalService {
  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepository: Repository<EmployeeEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditRepo: AuditRepository,
  ) {}

  async create(dto: CreateEmployeeDto, actor: AuditActor): Promise<EmployeeResponseDto> {
    const { roleId, email, status, ...rest } = dto;
    const normalizedEmail = email.trim().toLowerCase();

    await this.assertEmailAvailable(normalizedEmail);
    await this.assertDpiAvailable(dto.dpi);
    await this.requireActiveRole(roleId);

    const employee = this.employeeRepository.create({
      ...rest,
      email: normalizedEmail,
      status: status ?? EMPLOYEE_STATUSES.ACTIVE,
      role: { id: roleId },
    });
    const saved = await this.translatingUniqueConflicts(() =>
      this.dataSource.transaction(async (manager) => {
        const persisted = await manager.getRepository(EmployeeEntity).save(employee);
        // Never audit PII (dpi, phone, address, licence, education, languages).
        await this.recordAudit(manager, actor, PERSONAL_AUDIT_ACTIONS.CREATE, persisted.id, {
          email: normalizedEmail,
          roleId,
          status: employee.status,
        });
        return persisted;
      }),
    );
    return toEmployeeResponse(await this.loadEntity(saved.id));
  }

  async findAll(query: QueryEmployeesDto = {}): Promise<EmployeeResponseDto[]> {
    const base: FindOptionsWhere<EmployeeEntity> = {};
    if (query.status) {
      base.status = query.status;
    }
    if (query.roleId) {
      base.role = { id: query.roleId };
    }

    const search = query.search?.trim();
    const where: FindOptionsWhere<EmployeeEntity>[] | FindOptionsWhere<EmployeeEntity> =
      search
        ? (["name", "email", "dpi"] as const).map((field) => ({
            ...base,
            [field]: ILike(`%${escapeLike(search)}%`),
          }))
        : base;

    const employees = await this.employeeRepository.find({
      where,
      relations: { role: true },
      order: { name: "ASC" },
    });
    return employees.map(toEmployeeResponse);
  }

  async findOne(id: string): Promise<EmployeeResponseDto> {
    return toEmployeeResponse(await this.loadEntity(id));
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    actor: AuditActor,
  ): Promise<EmployeeResponseDto> {
    const employee = await this.loadEntity(id);
    const { roleId, email, ...rest } = dto;

    const normalizedEmail =
      email !== undefined && email !== null ? email.trim().toLowerCase() : undefined;
    if (normalizedEmail !== undefined) {
      await this.assertEmailAvailable(normalizedEmail, id);
    }
    if (typeof rest.dpi === "string") {
      await this.assertDpiAvailable(rest.dpi, id);
    }

    // Only a role that is actually changing needs to be validated again.
    const roleChanged = roleId !== undefined && roleId !== null && roleId !== employee.role.id;
    if (roleChanged) {
      await this.requireActiveRole(roleId);
    }

    // Apply only the fields that were actually provided. `@IsOptional()` (added
    // by PartialType) lets an explicit `null` through validation, so required
    // columns such as dpi must also ignore null to never be cleared.
    const previousStatus = employee.status;
    const changedFields: string[] = [];
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) {
        continue;
      }
      if (value === null && NON_NULLABLE_FIELDS.has(key)) {
        continue;
      }
      const record = employee as unknown as Record<string, unknown>;
      if (record[key] !== value) {
        changedFields.push(key);
      }
      record[key] = value;
    }
    if (normalizedEmail !== undefined) {
      if (employee.email !== normalizedEmail) {
        changedFields.push("email");
      }
      employee.email = normalizedEmail;
    }
    const previousRoleId = employee.role.id;
    if (roleId !== undefined && roleId !== null) {
      if (roleChanged) {
        changedFields.push("roleId");
      }
      employee.role = { id: roleId } as EmployeeEntity["role"];
    }

    // Only field names and status/role transitions are audited, never values
    // of PII columns (dpi, phone, address, licence, education, languages).
    const detalle: Record<string, unknown> = { changedFields };
    if (employee.status !== previousStatus) {
      detalle.status = { from: previousStatus, to: employee.status };
    }
    if (roleChanged) {
      detalle.roleId = { from: previousRoleId, to: roleId };
    }

    await this.translatingUniqueConflicts(() =>
      this.dataSource.transaction(async (manager) => {
        await manager.getRepository(EmployeeEntity).save(employee);
        await this.recordAudit(manager, actor, PERSONAL_AUDIT_ACTIONS.UPDATE, id, detalle);
      }),
    );
    return toEmployeeResponse(await this.loadEntity(id));
  }

  async remove(id: string, actor: AuditActor): Promise<void> {
    const employee = await this.loadEntity(id);
    if (id === actor.employeeId) {
      throw new ConflictException("No puede eliminar su propio usuario");
    }

    // Captured before the delete: TypeORM clears the id of a removed entity, and
    // the audit row must describe the employee as it was.
    const { email, roleId } = { email: employee.email, roleId: employee.role.id };

    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(EmployeeEntity).remove(employee);
        // The removed id is the route id, not the (now cleared) entity id.
        await this.recordAudit(manager, actor, PERSONAL_AUDIT_ACTIONS.REMOVE, id, {
          email,
          roleId,
        });
      });
    } catch (error) {
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          "No se puede eliminar el empleado porque tiene historial asociado; " +
            'desactívelo en su lugar (PATCH con status "INACTIVO")',
        );
      }
      throw error;
    }
  }

  private async assertEmailAvailable(email: string, excludeId?: string): Promise<void> {
    const duplicates = await this.employeeRepository.count({
      where: { email, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (duplicates > 0) {
      throw new ConflictException(`Ya existe un empleado con el correo ${email}`);
    }
  }

  private async assertDpiAvailable(dpi: string, excludeId?: string): Promise<void> {
    const duplicates = await this.employeeRepository.count({
      where: { dpi, ...(excludeId ? { id: Not(excludeId) } : {}) },
    });
    if (duplicates > 0) {
      throw new ConflictException(`Ya existe un empleado con el DPI ${dpi}`);
    }
  }

  private async requireActiveRole(roleId: string): Promise<RoleEntity> {
    // Ids are bigint strings; a non-numeric id can never match a row.
    const role = /^\d+$/.test(roleId)
      ? await this.roleRepository.findOne({ where: { id: roleId, active: true } })
      : null;
    if (!role) {
      throw new BadRequestException(`El rol ${roleId} no existe o está inactivo`);
    }
    return role;
  }

  /** Writes the audit row inside the caller's transaction (actor = who performed the change). */
  private async recordAudit(
    manager: EntityManager,
    actor: AuditActor,
    action: PersonalAuditAction,
    entityId: string,
    detalle: Record<string, unknown>,
  ): Promise<void> {
    const actorEntity = await manager
      .getRepository(EmployeeEntity)
      .findOneOrFail({ where: { id: actor.employeeId } });
    await this.auditRepo.create(manager, {
      action,
      employee: actorEntity,
      entityId,
      entityType: PERSONAL_ENTITY_TYPE,
      module: PERSONAL_MODULE,
      result: AUDIT_RESULTS.SUCCESS,
      detalle,
    });
  }

  /** Runs the (transactional) write, mapping a racing unique violation to a 409. */
  private async translatingUniqueConflicts<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new ConflictException(uniqueViolationMessage(error));
      }
      throw error;
    }
  }

  private async loadEntity(id: string): Promise<EmployeeEntity> {
    // Ids are bigint strings; a non-numeric id can never match a row.
    const employee = /^\d+$/.test(id)
      ? await this.employeeRepository.findOne({
          where: { id },
          relations: { role: true },
        })
      : null;

    if (!employee) {
      throw new NotFoundException(`Empleado con ID ${id} no encontrado`);
    }

    return employee;
  }
}
