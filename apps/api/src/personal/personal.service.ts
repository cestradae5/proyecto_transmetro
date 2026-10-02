import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ILike, type FindOptionsWhere, Repository } from "typeorm";

import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../authentication/entities/employee.entity.js";
import type { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import { EmployeeResponseDto } from "./dto/employee-response.dto.js";
import type { QueryEmployeesDto } from "./dto/query-employees.dto.js";
import type { UpdateEmployeeDto } from "./dto/update-employee.dto.js";

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

@Injectable()
export class PersonalService {
  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly employeeRepository: Repository<EmployeeEntity>,
  ) {}

  async create(dto: CreateEmployeeDto): Promise<EmployeeResponseDto> {
    const { roleId, email, status, ...rest } = dto;
    const employee = this.employeeRepository.create({
      ...rest,
      email: email.trim().toLowerCase(),
      status: status ?? EMPLOYEE_STATUSES.ACTIVE,
      role: { id: roleId },
    });
    const saved = await this.employeeRepository.save(employee);
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

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeResponseDto> {
    const employee = await this.loadEntity(id);
    const { roleId, email, ...rest } = dto;

    // Apply only the fields that were actually provided. `@IsOptional()` (added
    // by PartialType) lets an explicit `null` through validation, so required
    // columns such as dpi must also ignore null to never be cleared.
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) {
        continue;
      }
      if (value === null && NON_NULLABLE_FIELDS.has(key)) {
        continue;
      }
      (employee as unknown as Record<string, unknown>)[key] = value;
    }
    if (email !== undefined && email !== null) {
      employee.email = email.trim().toLowerCase();
    }
    if (roleId !== undefined && roleId !== null) {
      employee.role = { id: roleId } as EmployeeEntity["role"];
    }

    await this.employeeRepository.save(employee);
    return toEmployeeResponse(await this.loadEntity(id));
  }

  async remove(id: string): Promise<void> {
    const employee = await this.loadEntity(id);
    await this.employeeRepository.remove(employee);
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
