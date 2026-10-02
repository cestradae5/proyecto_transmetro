// PersonalService business rules (mocked repositories, direct instantiation).

import { jest } from "@jest/globals";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { QueryFailedError, type Repository } from "typeorm";

import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../authentication/entities/employee.entity.js";
import type { RoleEntity } from "../authentication/entities/role.entity.js";
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
    remove: jest.fn<(entity: EmployeeEntity) => Promise<EmployeeEntity>>(),
    count: jest.fn<(options: { where: Record<string, unknown> }) => Promise<number>>(),
  };
  const roleRepository = {
    findOne: jest.fn<(options: unknown) => Promise<RoleEntity | null>>(),
  };
  let service: PersonalService;

  beforeEach(() => {
    jest.resetAllMocks();
    employeeRepository.count.mockResolvedValue(0);
    employeeRepository.create.mockImplementation((value) => value as EmployeeEntity);
    employeeRepository.save.mockImplementation(async (entity) => entity as EmployeeEntity);
    roleRepository.findOne.mockResolvedValue(makeRole());
    service = new PersonalService(
      employeeRepository as unknown as Repository<EmployeeEntity>,
      roleRepository as unknown as Repository<RoleEntity>,
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

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow(
        "Ya existe un empleado con el correo maria@transmetro.gt",
      );
      expect(employeeRepository.save).not.toHaveBeenCalled();
    });

    it("rejects a duplicate DPI with 409", async () => {
      duplicateOn("dpi");

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(employeeRepository.save).not.toHaveBeenCalled();
    });

    it("translates a unique violation (23505) from save into 409", async () => {
      employeeRepository.save.mockRejectedValue(
        pgError("23505", { constraint: "UQ_employee_dpi" }),
      );

      const attempt = service.create(dto);

      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow("Ya existe un empleado con el DPI indicado");
    });

    it("rethrows non-unique database errors untouched", async () => {
      const failure = pgError("40001");
      employeeRepository.save.mockRejectedValue(failure);

      await expect(service.create(dto)).rejects.toBe(failure);
    });

    it("rejects a missing role with 400", async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow("El rol 2 no existe o está inactivo");
    });

    it("looks the role up filtering by active", async () => {
      await service.create(dto);

      expect(roleRepository.findOne).toHaveBeenCalledWith({
        where: { id: "2", active: true },
      });
    });

    it("rejects an inactive role (not returned by the active lookup) with 400", async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.create({ ...dto, roleId: "7" })).rejects.toThrow(
        "El rol 7 no existe o está inactivo",
      );
    });

    it("accepts a PILOTO with a licence", async () => {
      await expect(service.create(dto)).resolves.toMatchObject({ id: "1" });
    });

    it("keeps the licence optional for non-pilot roles", async () => {
      roleRepository.findOne.mockResolvedValue(makeRole({ id: "3", code: "ADMIN" }));
      const { licenseNumber: _omitted, ...withoutLicense } = dto;

      await expect(service.create({ ...withoutLicense, roleId: "3" })).resolves.toBeDefined();
    });
  });

  describe("update", () => {
    beforeEach(() => {
      employeeRepository.findOne.mockResolvedValue(makeEmployee());
    });

    it("rejects a duplicate email excluding the employee itself", async () => {
      duplicateOn("email");

      await expect(service.update("1", { email: "Other@transmetro.gt" })).rejects.toThrow(
        ConflictException,
      );

      const query = employeeRepository.count.mock.calls[0]?.[0];
      expect(query?.where.email).toBe("other@transmetro.gt");
      expect(JSON.stringify(query?.where.id)).toContain("1");
      expect(employeeRepository.save).not.toHaveBeenCalled();
    });

    it("rejects a duplicate DPI excluding the employee itself", async () => {
      duplicateOn("dpi");

      await expect(service.update("1", { dpi: "1111111111111" })).rejects.toThrow(
        ConflictException,
      );
      expect(employeeRepository.count.mock.calls[0]?.[0].where.id).toBeDefined();
    });

    it("does not check uniqueness when email and dpi are not provided", async () => {
      await service.update("1", { name: "Renamed" });

      expect(employeeRepository.count).not.toHaveBeenCalled();
    });

    it("translates a unique violation (23505) from save into 409", async () => {
      employeeRepository.save.mockRejectedValue(
        pgError("23505", { detail: "Key (email)=(a@b.c) already exists." }),
      );

      await expect(service.update("1", { name: "X" })).rejects.toThrow(
        "Ya existe un empleado con el correo indicado",
      );
    });

    it("rejects changing to a missing or inactive role with 400", async () => {
      roleRepository.findOne.mockResolvedValue(null);

      await expect(service.update("1", { roleId: "9" })).rejects.toThrow(BadRequestException);
      expect(employeeRepository.save).not.toHaveBeenCalled();
    });

    it("does not look the role up when roleId is unchanged", async () => {
      await service.update("1", { roleId: "2", name: "Same role" });

      expect(roleRepository.findOne).not.toHaveBeenCalled();
    });

    it("accepts changing the role to PILOTO when a licence is provided", async () => {
      employeeRepository.findOne.mockResolvedValue(
        makeEmployee({ role: makeRole({ id: "3", code: "ADMIN" }), licenseNumber: null }),
      );

      await expect(
        service.update("1", { roleId: "2", licenseNumber: "LIC-9" }),
      ).resolves.toBeDefined();
    });

    it("accepts changing the role to PILOTO when a licence is already stored", async () => {
      employeeRepository.findOne.mockResolvedValue(
        makeEmployee({ role: makeRole({ id: "3", code: "ADMIN" }), licenseNumber: "LIC-1" }),
      );

      await expect(service.update("1", { roleId: "2" })).resolves.toBeDefined();
    });

    it("lets a non-pilot clear the licence", async () => {
      employeeRepository.findOne.mockResolvedValue(
        makeEmployee({ role: makeRole({ id: "3", code: "ADMIN" }), licenseNumber: "LIC-1" }),
      );

      await service.update("1", {
        licenseNumber: null,
      } as unknown as Parameters<PersonalService["update"]>[1]);

      const saved = employeeRepository.save.mock.calls[0]?.[0] as EmployeeEntity;
      expect(saved.licenseNumber).toBeNull();
    });

    it("lets a non-pilot stay without licence", async () => {
      employeeRepository.findOne.mockResolvedValue(
        makeEmployee({ role: makeRole({ id: "3", code: "ADMIN" }), licenseNumber: null }),
      );

      await expect(service.update("1", { name: "Renamed" })).resolves.toBeDefined();
    });
  });

  describe("remove", () => {
    it("rejects deleting yourself with 409", async () => {
      employeeRepository.findOne.mockResolvedValue(makeEmployee());

      await expect(service.remove("1", "1")).rejects.toThrow(ConflictException);
      await expect(service.remove("1", "1")).rejects.toThrow(
        "No puede eliminar su propio usuario",
      );
      expect(employeeRepository.remove).not.toHaveBeenCalled();
    });

    it("answers 404 before the self-delete check", async () => {
      employeeRepository.findOne.mockResolvedValue(null);

      await expect(service.remove("1", "1")).rejects.toThrow(NotFoundException);
    });

    it("deletes another employee", async () => {
      const existing = makeEmployee();
      employeeRepository.findOne.mockResolvedValue(existing);
      employeeRepository.remove.mockResolvedValue(existing);

      await expect(service.remove("1", "9")).resolves.toBeUndefined();
      expect(employeeRepository.remove).toHaveBeenCalledWith(existing);
    });

    it("translates a foreign key violation (23503) into 409 suggesting deactivation", async () => {
      employeeRepository.findOne.mockResolvedValue(makeEmployee());
      employeeRepository.remove.mockRejectedValue(pgError("23503"));

      const attempt = service.remove("1", "9");

      await expect(attempt).rejects.toThrow(ConflictException);
      await expect(attempt).rejects.toThrow("INACTIVO");
    });

    it("rethrows other errors untouched", async () => {
      const failure = new Error("connection lost");
      employeeRepository.findOne.mockResolvedValue(makeEmployee());
      employeeRepository.remove.mockRejectedValue(failure);

      await expect(service.remove("1", "9")).rejects.toBe(failure);

      const otherPg = pgError("23505");
      employeeRepository.remove.mockRejectedValue(otherPg);
      await expect(service.remove("1", "9")).rejects.toBe(otherPg);
    });
  });
});
