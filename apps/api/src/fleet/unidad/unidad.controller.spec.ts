// UnidadController tests (mocked service). Verifies delegation to
// UnidadService, guard/permission/filter metadata wiring, and that the
// actor's employeeId is read from request.user (never a route param),
// matching the AuthenticationController/LineaController conventions.

import { jest } from "@jest/globals";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { EXCEPTION_FILTERS_METADATA } from "@nestjs/common/constants";
import { UnidadController } from "./unidad.controller.js";
import type { UnidadService } from "./unidad.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockUnidadService = Record<"create" | "findAll" | "findOne" | "update" | "remove", AnyMock>;

function makeMockService(): MockUnidadService {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function makeRequest(employeeId: string): Record<string, any> {
  return { user: { employeeId } };
}

function handler(method: string): () => void {
  return (UnidadController.prototype as unknown as Record<string, () => void>)[method]!;
}

const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";

describe("UnidadController", () => {
  let service: MockUnidadService;
  let controller: UnidadController;

  beforeEach(() => {
    service = makeMockService();
    controller = new UnidadController(service as unknown as UnidadService);
  });

  describe("delegation to UnidadService", () => {
    it("create() forwards the body and the actor's employeeId from request.user", async () => {
      const dto = { numeroPlaca: "AB-12345" } as never;
      service.create.mockResolvedValue({ idUnidad: "1" });

      const result = await controller.create(dto, makeRequest("actor-1"));

      expect(result).toEqual({ idUnidad: "1" });
      expect(service.create).toHaveBeenCalledWith(dto, "actor-1");
    });

    it("findAll() delegates with no arguments", async () => {
      service.findAll.mockResolvedValue([]);

      await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(service.findAll).toHaveBeenCalledWith();
    });

    it("findOne() forwards the id", async () => {
      service.findOne.mockResolvedValue({ idUnidad: "1" });

      await controller.findOne("1");

      expect(service.findOne).toHaveBeenCalledWith("1");
    });

    it("update() forwards id, body, and the actor's employeeId", async () => {
      const dto = { marca: "Scania" } as never;
      service.update.mockResolvedValue({ idUnidad: "1" });

      await controller.update("1", dto, makeRequest("actor-2"));

      expect(service.update).toHaveBeenCalledWith("1", dto, "actor-2");
    });

    it("remove() forwards the id and the actor's employeeId", async () => {
      service.remove.mockResolvedValue({ idUnidad: "1" });

      await controller.remove("1", makeRequest("actor-3"));

      expect(service.remove).toHaveBeenCalledWith("1", "actor-3");
    });
  });

  describe("guard, permission, and filter wiring", () => {
    it("guards the entire controller with AuthenticationGuard", () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, UnidadController);
      expect(guards).toContain(AuthenticationGuard);
    });

    it("applies DomainExceptionFilter at the controller level", () => {
      const filters = Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, UnidadController);
      expect(filters).toContain(DomainExceptionFilter);
    });

    it.each(["create", "findAll", "findOne", "update", "remove"])(
      "requires FLOTA_GESTIONAR permission on %s()",
      (method) => {
        const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler(method));
        expect(permissions).toEqual([FLOTA_GESTIONAR]);
      },
    );
  });
});
