// PersonalService business rules (mocked repositories, direct instantiation).

import { jest } from "@jest/globals";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { QueryFailedError, type DataSource, type Repository } from "typeorm";

import {
  type AuditLogEntity,
} from "../authentication/entities/audit-log.entity.js";
import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../authentication/entities/employee.entity.js";
import type { RoleEntity } from "../authentication/entities/role.entity.js";
import type { AuditRepository } from "../authentication/infrastructure/audit.repository.js";
import type { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import { PersonalService } from "./personal.service.js";

function makeRole(overrides: Partial<RoleEntity> = {}): RoleEntity {
  return { id: "2", code: "PILOTO", name: "Piloto", active: true, ...overrides } as RoleEntity;
}

function makeEmployee(overrides: Partial<EmployeeEntity> = {}): EmployeeEntity {
  return {
    id: "1",
    name: "Maria Lopez",
    email: "maria@transmetro.gt",
    status: EMPLOYEE_STATUSES.ACTIVE,
    dpi: "2456789012301",
    licenseNumber: "LIC-1",
    role: makeRole(),
    ...overrides,
  } as EmployeeEntity;
}

function pgError(code: string, extra: Record<string, unknown> = {}): QueryFailedError {
  return new QueryFailedError("query", [], Object.assign(new Error("pg"), { code, ...extra }));
}

describe("PersonalService business rules", () => {
  const employeeRepository = {
    create: jest.fn<(value: unknown) => EmployeeEntity>(),
    save: jest.fn<(entity: unknown) => Promise<EmployeeEntity>>(),
    find: jest.fn(),
    findOne: jest.fn<(options: unknown) => Promise<EmployeeEntity | null>>(),
    findOneOrFail: jest.fn<(options: unknown) => Promise<EmployeeEntity>>(),
    remove: jest.fn<(entity: EmployeeEntity) => Promise<EmployeeEntity>>(),
    count: jest.fn<(options: { where: Record<string, unknown> }) => Promise<number>>(),
  };
  const roleRepository = {
    findOne: jest.fn<(options: unknown) => Promise<RoleEntity | null>>(),
  };
  let manager: { getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let auditRepo: { create: jest.MockedFunction<AuditRepository["create"]> };
  let service: PersonalService;

  // The authenticated employee performing the mutation (not the affected one).
  const actor = { employeeId: "9" };
  const selfActor = { employeeId: "1" };

  beforeEach(() => {
    jest.resetAllMocks();
    employeeRepository.count.mockResolvedValue(0);
    employeeRepository.create.mockImplementation((value) => value as EmployeeEntity);
    employeeRepository.save.mockImplementation(async (entity) => entity as EmployeeEntity);
    employeeRepository.findOneOrFail.mockImplementation(async () => makeEmployee({ id: "9" }));
    roleRepository.findOne.mockResolvedValue(makeRole());
    // The transactional manager hands out the same mocked employee repository, so
    // assertions on `save`/`remove` cover the writes made inside the transaction.
    manager = { getRepository: jest.fn().mockReturnValue(employeeRepository) };
    dataSource = {
      transaction: jest.fn(async (work: unknown) =>
        (work as (entityManager: unknown) => Promise<unknown>)(manager),
      ),
    };
    auditRepo = {
      create: jest
        .fn<AuditRepository["create"]>()
        .mockImplementation(async () => ({}) as AuditLogEntity),
    };
    service = new PersonalService(
      employeeRepository as unknown as Repository<EmployeeEntity>,
      roleRepository as unknown as Repository<RoleEntity>,
      dataSource as unknown as DataSource,
      auditRepo as unknown as AuditRepository,
    );
  });

  /** Makes `count` report a duplicate only for queries filtering on `field`. */
  function duplicateOn(field: "email" | "dpi"): void {
    employeeRepository.count.mockImplementation(async ({ where }) => (field in where ? 1 : 0));
  }

  describe("create", () => {
    const dto: CreateEmployeeDto = {
      name: "Maria Lopez",
      email: "Maria@Transmetro.GT",
      roleId: "2",
      dpi: "2456789012301",
      licenseNumber: "LIC-1",
    };

    beforeEach(() => {
      employeeRepository.findOne.mockResolvedValue(makeEmployee());
      employeeRepository.save.mockResolvedValue(makeEmployee());
    });

    it("rejects a duplicate email (compared in lowercase) with 409", async () => {
      duplicateOn("email");

      await expect(service.create(dto, actor)).rejects.toThrow(ConflictException);
      await expect(service.create(dto, actor)).rejects.toThrow(
        "Ya existe un empleado con el correo maria@transmetro.gt",
      );
      expect(employeeRepository.save).not.toHaveBeenCalled();
      // A rejected pre-check must not leave an audit row behind.
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("rejects a duplicate DPI with 409", async () => {
      duplicateOn("dpi");

      await expect(service.create(dto, actor)).rejects.toThrow(ConflictException);
      expect(employeeRepository.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("translates a unique violation (23505) from save into 409", async () => {
      employeeRepository.save.mockRejectedValue(
        pgError("23505", { constraint: "UQ_employee_dpi" }),
      );

      const attempt = service.create(dto, actor);

      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow("Ya existe un empleado con el DPI indicado");
      // The transaction rolled back, so nothing was audited.
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("rethrows non-unique database errors untouched", async () => {
      const failure = pgError("40001");
      employeeRepository.save.mockRejectedValue(failure);

      await expect(service.create(dto, actor)).rejects.toBe(failure);
    });

    it("rejects a missing role with 400", async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto, actor)).rejects.toThrow(
        "El rol 2 no existe o está inactivo",
      );
      expect(employeeRepository.save).not.toHaveBeenCalled();
    });

    it("looks the role up filtering by active", async () => {
      await service.create(dto, actor);

      expect(roleRepository.findOne).toHaveBeenCalledWith({
        where: { id: "2", active: true },
      });
    });

    it("rejects an inactive role (not returned by the active lookup) with 400", async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.create({ ...dto, roleId: "7" }, actor)).rejects.toThrow(
        "El rol 7 no existe o está inactivo",
      );
    });

    it("accepts a PILOTO with a licence", async () => {
      await expect(service.create(dto, actor)).resolves.toMatchObject({ id: "1" });
    });

    it("keeps the licence optional for non-pilot roles", async () => {
      roleRepository.findOne.mockResolvedValue(makeRole({ id: "3", code: "ADMIN" }));
      const { licenseNumber: _omitted, ...withoutLicense } = dto;

      await expect(
        service.create({ ...withoutLicense, roleId: "3" }, actor),
      ).resolves.toBeDefined();
    });
  });

  describe("update", () => {
    beforeEach(() => {
      employeeRepository.findOne.mockResolvedValue(makeEmployee());
    });

    it("rejects a duplicate email excluding the employee itself", async () => {
      duplicateOn("email");

      await expect(
        service.update("1", { email: "Other@transmetro.gt" }, actor),
      ).rejects.toThrow(ConflictException);

      const query = employeeRepository.count.mock.calls[0]?.[0];
      expect(query?.where.email).toBe("other@transmetro.gt");
      expect(JSON.stringify(query?.where.id)).toContain("1");
      expect(employeeRepository.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("rejects a duplicate DPI excluding the employee itself", async () => {
      duplicateOn("dpi");

      await expect(service.update("1", { dpi: "1111111111111" }, actor)).rejects.toThrow(
        ConflictException,
      );
      expect(employeeRepository.count.mock.calls[0]?.[0].where.id).toBeDefined();
    });

    it("does not check uniqueness when email and dpi are not provided", async () => {
      await service.update("1", { name: "Renamed" }, actor);

      expect(employeeRepository.count).not.toHaveBeenCalled();
    });

    it("translates a unique violation (23505) from save into 409", async () => {
      employeeRepository.save.mockRejectedValue(
        pgError("23505", { detail: "Key (email)=(a@b.c) already exists." }),
      );

      await expect(service.update("1", { name: "X" }, actor)).rejects.toThrow(
        "Ya existe un empleado con el correo indicado",
      );
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("rejects changing to a missing or inactive role with 400", async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.update("1", { roleId: "9" }, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(employeeRepository.save).not.toHaveBeenCalled();
    });

    it("does not look the role up when roleId is unchanged", async () => {
      await service.update("1", { roleId: "2", name: "Same role" }, actor);

      expect(roleRepository.findOne).not.toHaveBeenCalled();
    });

    it("accepts changing the role to PILOTO when a licence is provided", async () => {
      employeeRepository.findOne.mockResolvedValue(
        makeEmployee({ role: makeRole({ id: "3", code: "ADMIN" }), licenseNumber: null }),
      );

      await expect(
        service.update("1", { roleId: "2", licenseNumber: "LIC-9" }, actor),
      ).resolves.toBeDefined();
    });

    it("accepts changing the role to PILOTO when a licence is already stored", async () => {
      employeeRepository.findOne.mockResolvedValue(
        makeEmployee({ role: makeRole({ id: "3", code: "ADMIN" }), licenseNumber: "LIC-1" }),
      );

      await expect(service.update("1", { roleId: "2" }, actor)).resolves.toBeDefined();
    });

    it("lets a non-pilot clear the licence", async () => {
      employeeRepository.findOne.mockResolvedValue(
        makeEmployee({ role: makeRole({ id: "3", code: "ADMIN" }), licenseNumber: "LIC-1" }),
      );

      await service.update(
        "1",
        {
          licenseNumber: null,
        } as unknown as Parameters<PersonalService["update"]>[1],
        actor,
      );

      const saved = employeeRepository.save.mock.calls[0]?.[0] as EmployeeEntity;
      expect(saved.licenseNumber).toBeNull();
    });

    it("lets a non-pilot stay without licence", async () => {
      employeeRepository.findOne.mockResolvedValue(
        makeEmployee({ role: makeRole({ id: "3", code: "ADMIN" }), licenseNumber: null }),
      );

      await expect(service.update("1", { name: "Renamed" }, actor)).resolves.toBeDefined();
    });
  });

  describe("remove", () => {
    it("rejects deleting yourself with 409", async () => {
      employeeRepository.findOne.mockResolvedValue(makeEmployee());

      await expect(service.remove("1", selfActor)).rejects.toThrow(ConflictException);
      await expect(service.remove("1", selfActor)).rejects.toThrow(
        "No puede eliminar su propio usuario",
      );
      expect(employeeRepository.remove).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("answers 404 before the self-delete check", async () => {
      employeeRepository.findOne.mockResolvedValue(null);

      await expect(service.remove("1", selfActor)).rejects.toThrow(NotFoundException);
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("deletes another employee", async () => {
      const existing = makeEmployee();
      employeeRepository.findOne.mockResolvedValue(existing);
      employeeRepository.remove.mockResolvedValue(existing);

      await expect(service.remove("1", actor)).resolves.toBeUndefined();
      expect(employeeRepository.remove).toHaveBeenCalledWith(existing);
    });

    it("translates a foreign key violation (23503) into 409 suggesting deactivation", async () => {
      employeeRepository.findOne.mockResolvedValue(makeEmployee());
      employeeRepository.remove.mockRejectedValue(pgError("23503"));

      const attempt = service.remove("1", actor);

      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow("INACTIVO");
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("rethrows other errors untouched", async () => {
      const failure = new Error("connection lost");
      employeeRepository.findOne.mockResolvedValue(makeEmployee());
      employeeRepository.remove.mockRejectedValue(failure);

      await expect(service.remove("1", actor)).rejects.toBe(failure);

      const otherPg = pgError("23505");
      employeeRepository.remove.mockRejectedValue(otherPg);
      await expect(service.remove("1", actor)).rejects.toBe(otherPg);
    });
  });
});