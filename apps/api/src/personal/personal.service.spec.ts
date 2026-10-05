// PersonalService unit tests (mocked repository, direct instantiation).

import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import type { DataSource, Repository } from "typeorm";

import { AUDIT_RESULTS, type AuditLogEntity } from "../authentication/entities/audit-log.entity.js";
import type { AuditRepository } from "../authentication/infrastructure/audit.repository.js";
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
  count: jest.MockedFunction<(options: unknown) => Promise<number>>;
  findOneOrFail: jest.MockedFunction<(options: unknown) => Promise<EmployeeEntity>>;
};

function makeMockRepository(): MockRepository {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneOrFail: jest.fn(),
    remove: jest.fn(),
    count: jest.fn<(options: unknown) => Promise<number>>().mockResolvedValue(0),
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
    licenseNumber: "LIC-1",
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
    const entity = makeEmployee({ dpi: null, licenseNumber: null });
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
  let roleRepository: {
    findOne: jest.MockedFunction<(options: unknown) => Promise<RoleEntity | null>>;
    find: jest.MockedFunction<(options: unknown) => Promise<RoleEntity[]>>;
  };
  let service: PersonalService;
  let manager: { getRepository: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let auditRepo: { create: jest.MockedFunction<AuditRepository["create"]> };
  let callOrder: string[];
  // The authenticated employee performing the mutation (not the affected one).
  const actor = { employeeId: "9" };

  beforeEach(() => {
    repository = makeMockRepository();
    roleRepository = {
      findOne: jest.fn<(options: unknown) => Promise<RoleEntity | null>>().mockResolvedValue(makeRole()),
      find: jest.fn<(options: unknown) => Promise<RoleEntity[]>>().mockResolvedValue([]),
    };
    callOrder = [];
    // The transactional manager hands out the same mocked employee repository.
    manager = { getRepository: jest.fn().mockReturnValue(repository) };
    dataSource = {
      transaction: jest.fn(async (work: unknown) =>
        (work as (entityManager: unknown) => Promise<unknown>)(manager),
      ),
    };
    auditRepo = {
      create: jest.fn<AuditRepository["create"]>().mockImplementation(async () => {
        callOrder.push("audit");
        return {} as AuditLogEntity;
      }),
    };
    repository.findOneOrFail.mockResolvedValue(makeEmployee({ id: "9" }));
    service = new PersonalService(
      repository as unknown as Repository<EmployeeEntity>,
      roleRepository as unknown as Repository<RoleEntity>,
      dataSource as unknown as DataSource,
      auditRepo as unknown as AuditRepository,
    );
  });

  describe("create", () => {
    const dto: CreateEmployeeDto = {
      name: "Maria Lopez",
      email: "  Maria@Transmetro.GT ",
      roleId: "2",
      dpi: "2456789012301",
      licenseNumber: "LIC-1",
    };

    it("lowercases the email, defaults status to ACTIVO and sets the role", async () => {
      repository.create.mockImplementation((value) => value as EmployeeEntity);
      repository.save.mockResolvedValue(makeEmployee());
      repository.findOne.mockResolvedValue(makeEmployee());

      const result = await service.create(dto, actor);

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

      await service.create({ ...dto, status: EMPLOYEE_STATUSES.INACTIVE }, actor);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: EMPLOYEE_STATUSES.INACTIVE }),
      );
    });

    it("audits the creation with the actor and no PII, in the same transaction", async () => {
      repository.create.mockImplementation((value) => value as EmployeeEntity);
      repository.save.mockImplementation(async (entity) => {
        callOrder.push("save");
        return { ...(entity as EmployeeEntity), id: "31" } as EmployeeEntity;
      });
      repository.findOne.mockResolvedValue(makeEmployee({ id: "31" }));

      await service.create(
        {
          ...dto,
          phone: "PHONE-SECRET",
          address: "ADDRESS-SECRET",
          educationHistory: "EDUCATION-SECRET",
          languages: "LANGUAGES-SECRET",
        },
        actor,
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      const [usedManager, record] = auditRepo.create.mock.calls[0] ?? [];
      expect(usedManager).toBe(manager);
      expect(record).toMatchObject({
        action: "create",
        entityId: "31",
        entityType: "empleado",
        module: "personal",
        result: AUDIT_RESULTS.SUCCESS,
        employee: { id: "9" },
      });
      expect(record?.detalle).toEqual({
        email: "maria@transmetro.gt",
        roleId: "2",
        status: EMPLOYEE_STATUSES.ACTIVE,
      });
      const serialized = JSON.stringify(record?.detalle);
      for (const secret of [
        "2456789012301",
        "PHONE-SECRET",
        "ADDRESS-SECRET",
        "LIC-1",
        "EDUCATION-SECRET",
        "LANGUAGES-SECRET",
      ]) {
        expect(serialized).not.toContain(secret);
      }
      expect(callOrder).toEqual(["save", "audit"]);
    });

    it("propagates an audit failure", async () => {
      const failure = new Error("audit down");
      repository.create.mockImplementation((value) => value as EmployeeEntity);
      repository.save.mockResolvedValue(makeEmployee());
      auditRepo.create.mockRejectedValue(failure);

      await expect(service.create(dto, actor)).rejects.toBe(failure);
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

  describe("findRoles", () => {
    it("queries only active roles ordered by name", async () => {
      await service.findRoles();

      expect(roleRepository.find).toHaveBeenCalledWith({
        where: { active: true },
        order: { name: "ASC" },
      });
    });

    it("maps each role to id, code and name only", async () => {
      roleRepository.find.mockResolvedValue([
        makeRole({ id: "3", code: "GUARDIA", name: "Guardia", active: true }),
        makeRole({ id: "2", code: "PILOTO", name: "Piloto", active: true }),
      ]);

      const result = await service.findRoles();

      expect(result).toEqual([
        { id: "3", code: "GUARDIA", name: "Guardia" },
        { id: "2", code: "PILOTO", name: "Piloto" },
      ]);
    });

    it("returns an empty array when there are no active roles", async () => {
      await expect(service.findRoles()).resolves.toEqual([]);
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
      roleRepository.findOne.mockResolvedValue(makeRole({ id: "5", code: "ADMIN" }));
      const existing = makeEmployee({ phone: "5555-1234" });
      repository.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(makeEmployee({ name: "Maria Renombrada" }));
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);

      const result = await service.update(
        "1",
        {
          name: "Maria Renombrada",
          email: "NEW@Transmetro.gt",
          roleId: "5",
        },
        actor,
      );

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

      await service.update("1", { name: undefined, address: "Zona 1" }, actor);

      const saved = repository.save.mock.calls[0]?.[0] as EmployeeEntity;
      expect(saved.name).toBe("Maria Lopez");
      expect(saved.address).toBe("Zona 1");
    });

    it("never clears required columns when null is sent", async () => {
      repository.findOne.mockResolvedValue(makeEmployee());
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);

      await service.update(
        "1",
        {
          dpi: null,
          name: null,
          email: null,
          roleId: null,
        } as unknown as Parameters<PersonalService["update"]>[1],
        actor,
      );

      const saved = repository.save.mock.calls[0]?.[0] as EmployeeEntity;
      expect(saved.dpi).toBe("2456789012301");
      expect(saved.name).toBe("Maria Lopez");
      expect(saved.email).toBe("maria@transmetro.gt");
      expect(saved.role.id).toBe("2");
    });

    it("throws NotFoundException when the employee does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update("99", { name: "X" }, actor)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.save).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("audits only the changed field names and the status and role transitions", async () => {
      roleRepository.findOne.mockResolvedValue(makeRole({ id: "5", code: "ADMIN" }));
      repository.findOne
        .mockResolvedValueOnce(makeEmployee({ phone: "5555-1234" }))
        .mockResolvedValueOnce(makeEmployee());
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);

      await service.update(
        "1",
        {
          name: "Maria Lopez", // unchanged: must not be listed
          phone: "7777-0000",
          status: EMPLOYEE_STATUSES.INACTIVE,
          roleId: "5",
        },
        actor,
      );

      const record = auditRepo.create.mock.calls[0]?.[1];
      expect(record).toMatchObject({
        action: "update",
        entityId: "1",
        entityType: "empleado",
        module: "personal",
        result: AUDIT_RESULTS.SUCCESS,
        employee: { id: "9" },
      });
      expect(record?.detalle).toEqual({
        changedFields: ["phone", "status", "roleId"],
        status: { from: "ACTIVO", to: "INACTIVO" },
        roleId: { from: "2", to: "5" },
      });
      expect(JSON.stringify(record?.detalle)).not.toContain("7777-0000");
    });

    it("omits status and roleId transitions when they do not change", async () => {
      repository.findOne.mockResolvedValue(makeEmployee());
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);

      await service.update(
        "1",
        { status: EMPLOYEE_STATUSES.ACTIVE, roleId: "2", address: "Zona 1" },
        actor,
      );

      expect(auditRepo.create.mock.calls[0]?.[1].detalle).toEqual({ changedFields: ["address"] });
    });

    it("never puts PII values in the audit detalle", async () => {
      repository.findOne.mockResolvedValue(makeEmployee());
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);

      await service.update(
        "1",
        {
          dpi: "9999999999999",
          phone: "PHONE-SECRET",
          address: "ADDRESS-SECRET",
          licenseNumber: "LICENSE-SECRET",
          educationHistory: "EDUCATION-SECRET",
          languages: "LANGUAGES-SECRET",
        },
        actor,
      );

      const detalle = JSON.stringify(auditRepo.create.mock.calls[0]?.[1].detalle);
      for (const secret of [
        "9999999999999",
        "PHONE-SECRET",
        "ADDRESS-SECRET",
        "LICENSE-SECRET",
        "EDUCATION-SECRET",
        "LANGUAGES-SECRET",
      ]) {
        expect(detalle).not.toContain(secret);
      }
      expect(auditRepo.create.mock.calls[0]?.[1].detalle).toEqual({
        changedFields: ["dpi", "phone", "address", "licenseNumber", "educationHistory", "languages"],
      });
    });

    it("writes the employee and the audit row through the same transaction manager, in order", async () => {
      repository.findOne.mockResolvedValue(makeEmployee());
      repository.save.mockImplementation(async (entity) => {
        callOrder.push("save");
        return entity as EmployeeEntity;
      });

      await service.update("1", { name: "Renamed" }, actor);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(auditRepo.create.mock.calls[0]?.[0]).toBe(manager);
      expect(callOrder).toEqual(["save", "audit"]);
    });

    it("propagates an audit failure", async () => {
      const failure = new Error("audit down");
      repository.findOne.mockResolvedValue(makeEmployee());
      repository.save.mockImplementation(async (entity) => entity as EmployeeEntity);
      auditRepo.create.mockRejectedValue(failure);

      await expect(service.update("1", { name: "Renamed" }, actor)).rejects.toBe(failure);
    });
  });

  describe("remove", () => {
    it("physically deletes the employee via repository.remove", async () => {
      const existing = makeEmployee();
      repository.findOne.mockResolvedValue(existing);
      repository.remove.mockResolvedValue(existing);

      await expect(service.remove("1", actor)).resolves.toBeUndefined();

      expect(repository.remove).toHaveBeenCalledWith(existing);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the employee does not exist", async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.remove("99", actor)).rejects.toThrow(NotFoundException);
      expect(repository.remove).not.toHaveBeenCalled();
      expect(auditRepo.create).not.toHaveBeenCalled();
    });

    it("audits the removal with the removed id, email and role only, in the same transaction", async () => {
      const existing = makeEmployee({ phone: "PHONE-SECRET" });
      repository.findOne.mockResolvedValue(existing);
      // TypeORM clears the id of a removed entity.
      repository.remove.mockImplementation(async (entity) => {
        callOrder.push("remove");
        (entity as { id?: string }).id = undefined;
        return entity;
      });

      await service.remove("1", actor);

      const [usedManager, record] = auditRepo.create.mock.calls[0] ?? [];
      expect(usedManager).toBe(manager);
      expect(record).toMatchObject({
        action: "remove",
        entityId: "1",
        entityType: "empleado",
        module: "personal",
        result: AUDIT_RESULTS.SUCCESS,
        employee: { id: "9" },
        detalle: { email: "maria@transmetro.gt", roleId: "2" },
      });
      expect(JSON.stringify(record?.detalle)).not.toContain("PHONE-SECRET");
      expect(callOrder).toEqual(["remove", "audit"]);
    });
  });
});
