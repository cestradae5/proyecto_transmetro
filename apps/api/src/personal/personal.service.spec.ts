// PersonalService unit tests (mocked repository, direct instantiation).

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";

import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../authentication/entities/employee.entity.js";
import type { RoleEntity } from "../authentication/entities/role.entity.js";
import type { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import { PersonalService, toEmployeeResponse } from "./personal.service.js";

type MockRepository = {
  create: jest.MockedFunction<(dto: unknown) => EmployeeEntity>;
  save: jest.MockedFunction<(entity: unknown) => Promise<EmployeeEntity>>;
  find: jest.MockedFunction<(options: unknown) => Promise<EmployeeEntity[]>>;
  findOne: jest.MockedFunction<(options: unknown) => Promise<EmployeeEntity | null>>;
  remove: jest.MockedFunction<(entity: EmployeeEntity) => Promise<EmployeeEntity>>;
};

function makeMockRepository(): MockRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };
}

function makeRole(overrides: Partial<RoleEntity> = {}): RoleEntity {
  return { id: "2", code: "PILOTO", name: "Piloto", ...overrides } as RoleEntity;
}

function makeEmployee(overrides: Partial<EmployeeEntity> = {}): EmployeeEntity {
  return {
    id: "1",
    name: "Maria Lopez",
    email: "maria@transmetro.gt",
    status: EMPLOYEE_STATUSES.ACTIVE,
    phone: null,
    dpi: "2456789012301",
    hireDate: null,
    address: null,
    licenseNumber: null,
    educationHistory: null,
    languages: null,
    role: makeRole(),
    ...overrides,
  } as EmployeeEntity;
}

describe("toEmployeeResponse", () => {
  it("maps role fields and keeps provided values", () => {
    const result = toEmployeeResponse(
      makeEmployee({ phone: "5555-1234", hireDate: "2024-03-15", languages: "ES, EN" }),
    );

    expect(result).toMatchObject({
      id: "1",
      roleId: "2",
      roleCode: "PILOTO",
      roleName: "Piloto",
      phone: "5555-1234",
      hireDate: "2024-03-15",
      languages: "ES, EN",
    });
    expect(result).not.toHaveProperty("role");
  });

  it("returns null for nullable fields that are null or undefined", () => {
    const entity = makeEmployee({ dpi: null });
    (entity as unknown as Record<string, unknown>).address = undefined;

    const result = toEmployeeResponse(entity);

    expect(result.dpi).toBeNull();
    expect(result.address).toBeNull();
    expect(result.licenseNumber).toBeNull();
    expect(result.educationHistory).toBeNull();
  });
});

describe("PersonalService", () => {
  let repository: MockRepository;
  let service: PersonalService;

  beforeEach(() => {
    repository = makeMockRepository();
    service = new PersonalService(repository as unknown as Repository<EmployeeEntity>);
  });

  describe("create", () => {
    const dto: CreateEmployeeDto = {
      name: "Maria Lopez",
      email: "  Maria@Transmetro.GT ",
      roleId: "2",
      dpi: "2456789012301",
    };

    it("lowercases the email, defaults status to ACTIVO and sets the role", async () => {
      repository.create.mockImplementation((value) => value as EmployeeEntity);
      repository.save.mockResolvedValue(makeEmployee());
      repository.findOne.mockResolvedValue(makeEmployee());

      const result = await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "maria@transmetro.gt",
          status: EMPLOYEE_STATUSES.ACTIVE,
          role: { id: "2" },
          dpi: "2456789012301",
        }),
      );
      expect(repository.create.mock.calls[0]?.[0]).not.toHaveProperty("roleId");
      // Reloaded with the role relation to build the response.
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: "1" },
        relations: { role: true },
      });
      expect(result.roleCode).toBe("PILOTO");
    });

    it("keeps an explicit status", async () => {
      repository.create.mockImplementation((value) => value as EmployeeEntity);
      repository.save.mockResolvedValue(makeEmployee());
      repository.findOne.mockResolvedValue(makeEmployee());

      await service.create({ ...dto, status: EMPLOYEE_STATUSES.INACTIVE });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: EMPLOYEE_STATUSES.INACTIVE }),
      );
    });
  });

  describe("findAll", () => {
    it("returns mapped employees ordered by name with the role joined", async () => {
      repository.find.mockResolvedValue([makeEmployee(), makeEmployee({ id: "2" })]);

      const result = await service.findAll({});

      expect(repository.find).toHaveBeenCalledWith({
        where: {},
        relations: { role: true },
        order: { name: "ASC" },
      });
      expect(result.map((employee) => employee.id)).toEqual(["1", "2"]);
    });

    it("applies status and roleId filters", async () => {
      repository.find.mockResolvedValue([]);

      await service.findAll({ status: EMPLOYEE_STATUSES.INACTIVE, roleId: "3" });

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "INACTIVO", role: { id: "3" } },
        }),
      );
    });

    it("searches name, email and dpi with OR conditions combined with filters", async () => {
      repository.find.mockResolvedValue([]);

      await service.findAll({ search: "50%_", status: EMPLOYEE_STATUSES.ACTIVE });

      const options = repository.find.mock.calls[0]?.[0] as {
        where: Array<Record<string, unknown>>;
      };
      expect(options.where).toHaveLength(3);
      expect(options.where.map((condition) => Object.keys(condition).sort())).toEqual([
        ["name", "status"],
        ["email", "status"],
        ["dpi", "status"],
      ].map((keys) => keys.sort()));
      for (const condition of options.where) {
        expect(condition.status).toBe("ACTIVO");
      }
      // LIKE wildcards in the search term are escaped.
      expect(JSON.stringify(options.where[0]?.name)).toContain("50\\\\%\\\\_");
    });
  });

  describe("findOne", () => {
    it("returns the mapped employee when found", async () => {
      repository.findOne.mockResolvedValue(makeEmployee());

      const result = await service.findOne("1");

      expect(result.id).toBe("1");
      expect(result.roleName).toBe("Piloto");
    });

    it("throws NotFoundException when the employee does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.findOne("99")).rejects.toThrow(NotFoundException);
      await expect(service.findOne("99")).rejects.toThrow("Empleado con ID 99 no encontrado");
    });

    it("throws NotFoundException for a non-numeric id without querying", async () => {
      await expect(service.findOne("abc")).rejects.toThrow(NotFoundException);
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("applies only provided fields, lowercases email and maps roleId", async () => {
      const existing = makeEmployee({ phone: "5555-1234" });
      repository.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(makeEmployee({ name: "Maria Renombrada" }));
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);

      const result = await service.update("1", {
        name: "Maria Renombrada",
        email: "NEW@Transmetro.gt",
        roleId: "5",
      });

      const saved = repository.save.mock.calls[0]?.[0] as EmployeeEntity;
      expect(saved.name).toBe("Maria Renombrada");
      expect(saved.email).toBe("new@transmetro.gt");
      expect(saved.role).toEqual({ id: "5" });
      // Untouched fields are preserved.
      expect(saved.phone).toBe("5555-1234");
      expect(saved.dpi).toBe("2456789012301");
      expect(result.name).toBe("Maria Renombrada");
    });

    it("does not overwrite fields with undefined", async () => {
      repository.findOne.mockResolvedValue(makeEmployee());
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);

      await service.update("1", { name: undefined, address: "Zona 1" });

      const saved = repository.save.mock.calls[0]?.[0] as EmployeeEntity;
      expect(saved.name).toBe("Maria Lopez");
      expect(saved.address).toBe("Zona 1");
    });

    it("never clears required columns when null is sent", async () => {
      repository.findOne.mockResolvedValue(makeEmployee());
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);

      await service.update("1", {
        dpi: null,
        name: null,
        email: null,
        roleId: null,
      } as unknown as Parameters<PersonalService["update"]>[1]);

      const saved = repository.save.mock.calls[0]?.[0] as EmployeeEntity;
      expect(saved.dpi).toBe("2456789012301");
      expect(saved.name).toBe("Maria Lopez");
      expect(saved.email).toBe("maria@transmetro.gt");
      expect(saved.role.id).toBe("2");
    });

    it("throws NotFoundException when the employee does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update("99", { name: "X" })).rejects.toThrow(NotFoundException);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("physically deletes the employee via repository.remove", async () => {
      const existing = makeEmployee();
      repository.findOne.mockResolvedValue(existing);
      repository.remove.mockResolvedValue(existing);

      await expect(service.remove("1")).resolves.toBeUndefined();

      expect(repository.remove).toHaveBeenCalledWith(existing);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the employee does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove("99")).rejects.toThrow(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
