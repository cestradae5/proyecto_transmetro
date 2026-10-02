// PersonalController tests (mocked service). Verifies (a) each endpoint
// delegates to PersonalService with the right arguments, (b) DELETE forwards
// the authenticated actor id, and (c) guard, permission, status-code and route
// metadata are declared, mirroring parada.controller.spec.ts.

import { jest } from "@jest/globals";
import { HttpStatus, UnauthorizedException } from "@nestjs/common";
import { GUARDS_METADATA, HTTP_CODE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import type { Request } from "express";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../authentication/permissions.decorator.js";
import type { CreateEmployeeDto } from "./dto/create-employee.dto.js";
import type { EmployeeResponseDto } from "./dto/employee-response.dto.js";
import type { QueryEmployeesDto } from "./dto/query-employees.dto.js";
import type { UpdateEmployeeDto } from "./dto/update-employee.dto.js";
import { PersonalController } from "./personal.controller.js";
import type { PersonalService } from "./personal.service.js";

type MockPersonalService = {
  create: jest.MockedFunction<PersonalService["create"]>;
  findAll: jest.MockedFunction<PersonalService["findAll"]>;
  findOne: jest.MockedFunction<PersonalService["findOne"]>;
  update: jest.MockedFunction<PersonalService["update"]>;
  remove: jest.MockedFunction<PersonalService["remove"]>;
};

function makeMockService(): MockPersonalService {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function makeEmployee(overrides: Partial<EmployeeResponseDto> = {}): EmployeeResponseDto {
  return {
    id: "7",
    name: "Ana Perez",
    email: "ana@transmetro.gt",
    status: "ACTIVO",
    roleId: "2",
    roleCode: "OPERADOR_CENTRAL",
    roleName: "Operador central",
    phone: null,
    dpi: "1234567890123",
    hireDate: null,
    address: null,
    licenseNumber: null,
    educationHistory: null,
    languages: null,
    ...overrides,
  };
}

function makeRequest(employeeId?: string): Request {
  return (employeeId ? { user: { employeeId } } : {}) as unknown as Request;
}

describe("PersonalController", () => {
  let service: MockPersonalService;
  let controller: PersonalController;

  beforeEach(() => {
    service = makeMockService();
    controller = new PersonalController(service as unknown as PersonalService);
  });

  describe("delegation to PersonalService", () => {
    it("create() delegates to service.create with the request body", async () => {
      const dto = {
        name: "Ana Perez",
        email: "ana@transmetro.gt",
        dpi: "1234567890123",
        roleId: "2",
      } as CreateEmployeeDto;
      const created = makeEmployee();
      service.create.mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(created);
    });

    it("findAll() delegates to service.findAll with the query", async () => {
      const query: QueryEmployeesDto = { search: "ana", status: "ACTIVO", roleId: "2" };
      const employees = [makeEmployee()];
      service.findAll.mockResolvedValue(employees);

      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toBe(employees);
    });

    it("findOne() delegates to service.findOne with the id", async () => {
      const employee = makeEmployee();
      service.findOne.mockResolvedValue(employee);

      const result = await controller.findOne("7");

      expect(service.findOne).toHaveBeenCalledWith("7");
      expect(result).toBe(employee);
    });

    it("update() delegates to service.update with the id and body", async () => {
      const dto = { phone: "55551234" } as UpdateEmployeeDto;
      const updated = makeEmployee({ phone: "55551234" });
      service.update.mockResolvedValue(updated);

      const result = await controller.update("7", dto);

      expect(service.update).toHaveBeenCalledWith("7", dto);
      expect(result).toBe(updated);
    });

    it("remove() passes the authenticated actor employee id to service.remove", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("7", makeRequest("42"));

      expect(service.remove).toHaveBeenCalledWith("7", "42");
    });

    it("remove() rejects with 401 and does not delete when request.user is missing", () => {
      expect(() => controller.remove("7", makeRequest())).toThrow(UnauthorizedException);
      expect(service.remove).not.toHaveBeenCalled();
    });

    it("propagates service errors unchanged", async () => {
      const error = new Error("boom");
      service.findOne.mockRejectedValue(error);

      await expect(controller.findOne("7")).rejects.toBe(error);
    });
  });

  describe("guard, permission and route metadata", () => {
    const handlers = ["create", "findAll", "findOne", "update", "remove"] as const;

    function handlerOf(method: (typeof handlers)[number]): () => void {
      return (PersonalController.prototype as unknown as Record<string, () => void>)[method]!;
    }

    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, PersonalController) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it("is mounted at personal/empleados", () => {
      expect(Reflect.getMetadata(PATH_METADATA, PersonalController)).toBe("personal/empleados");
    });

    it.each(handlers)(
      "requires EMPLEADOS_PERFILES_ADMINISTRAR permission on %s()",
      (method) => {
        expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf(method))).toEqual([
          "EMPLEADOS_PERFILES_ADMINISTRAR",
        ]);
      },
    );

    it("answers DELETE with 204 No Content", () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handlerOf("remove"))).toBe(
        HttpStatus.NO_CONTENT,
      );
    });
  });
});
