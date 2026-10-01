// AsignacionUnidadController tests (mocked service). Mirrors
// UnidadController's own spec: verifies delegation, guard/permission/filter
// metadata wiring, and that the actor's employeeId always comes from
// request.user (never a route param) — matching every existing fleet and
// infrastructure controller's convention.

import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { AsignacionUnidadController } from "./asignacion-unidad.controller.js";
import type { AsignacionUnidadService } from "./asignacion-unidad.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockService = Record<
  "assign" | "reassign" | "unassign" | "reportLocation" | "correctLocation",
  AnyMock
>;

function makeMockService(): MockService {
  return {
    assign: jest.fn(),
    reassign: jest.fn(),
    unassign: jest.fn(),
    reportLocation: jest.fn(),
    correctLocation: jest.fn(),
  };
}

function makeRequest(employeeId: string): Record<string, any> {
  return { user: { employeeId } };
}

function handler(method: string): () => void {
  return (AsignacionUnidadController.prototype as unknown as Record<string, () => void>)[
    method
  ]!;
}

const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";

describe("AsignacionUnidadController", () => {
  let service: MockService;
  let controller: AsignacionUnidadController;

  beforeEach(() => {
    service = makeMockService();
    controller = new AsignacionUnidadController(service as unknown as AsignacionUnidadService);
  });

  describe("delegation to AsignacionUnidadService", () => {
    it("create() forwards unitId, body, and the actor's employeeId", async () => {
      const dto = { idLinea: "10" } as never;
      service.assign.mockResolvedValue({ id: "a1" });

      const result = await controller.create("1", dto, makeRequest("actor-1"));

      expect(result).toEqual({ id: "a1" });
      expect(service.assign).toHaveBeenCalledWith("1", dto, "actor-1");
    });

    it("reassign() forwards unitId, body, and the actor's employeeId", async () => {
      const dto = { idLinea: "20" } as never;
      service.reassign.mockResolvedValue({ id: "a1" });

      await controller.reassign("1", dto, makeRequest("actor-2"));

      expect(service.reassign).toHaveBeenCalledWith("1", dto, "actor-2");
    });

    it("unassign() forwards unitId and the actor's employeeId", async () => {
      await controller.unassign("1", makeRequest("actor-3"));

      expect(service.unassign).toHaveBeenCalledWith("1", "actor-3");
    });

    it("reportLocation() forwards unitId, body, and the actor's employeeId", async () => {
      const dto = { idLineaParada: "7" } as never;
      service.reportLocation.mockResolvedValue({ id: "a1" });

      await controller.reportLocation("1", dto, makeRequest("actor-4"));

      expect(service.reportLocation).toHaveBeenCalledWith("1", dto, "actor-4");
    });

    it("correctLocation() forwards unitId, body, and the actor's employeeId", async () => {
      const dto = { idLineaParada: "8" } as never;
      service.correctLocation.mockResolvedValue({ id: "a1" });

      await controller.correctLocation("1", dto, makeRequest("actor-5"));

      expect(service.correctLocation).toHaveBeenCalledWith("1", dto, "actor-5");
    });
  });

  describe("guard, permission, and filter wiring", () => {
    it("guards the entire controller with AuthenticationGuard", () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AsignacionUnidadController);
      expect(guards).toContain(AuthenticationGuard);
    });

    it("applies DomainExceptionFilter at the controller level", () => {
      const filters = Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, AsignacionUnidadController);
      expect(filters).toContain(DomainExceptionFilter);
    });

    it.each(["create", "reassign", "unassign", "reportLocation", "correctLocation"])(
      "requires FLOTA_GESTIONAR permission on %s()",
      (method) => {
        const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler(method));
        expect(permissions).toEqual([FLOTA_GESTIONAR]);
      },
    );
  });
});
