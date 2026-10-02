// AsignacionPilotoController tests (mocked service). Mirrors
// AsignacionUnidadController's own spec: verifies delegation, guard/
// permission/filter metadata wiring, and that every actor/scope identifier
// always comes from request.user (never a route param) — matching every
// existing fleet controller's convention. The route-collision check itself
// (Decision 9) is an integration concern and lives in
// asignacion-piloto.e2e-spec.ts, not here.

import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { AsignacionPilotoController } from "./asignacion-piloto.controller.js";
import type { AsignacionPilotoService } from "./asignacion-piloto.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockService = Record<
  "assign" | "reassign" | "unassign" | "getOwnUnit" | "getOwnStops" | "reportOwnLocation",
  AnyMock
>;

function makeMockService(): MockService {
  return {
    assign: jest.fn(),
    reassign: jest.fn(),
    unassign: jest.fn(),
    getOwnUnit: jest.fn(),
    getOwnStops: jest.fn(),
    reportOwnLocation: jest.fn(),
  };
}

function makeRequest(employeeId: string): Record<string, any> {
  return { user: { employeeId } };
}

function handler(method: string): () => void {
  return (AsignacionPilotoController.prototype as unknown as Record<string, () => void>)[method]!;
}

const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";
const UNIDAD_ASIGNADA_CONSULTAR = "UNIDAD_ASIGNADA_CONSULTAR";
const METRICAS_UNIDAD_REPORTAR = "METRICAS_UNIDAD_REPORTAR";

describe("AsignacionPilotoController", () => {
  let service: MockService;
  let controller: AsignacionPilotoController;

  beforeEach(() => {
    service = makeMockService();
    controller = new AsignacionPilotoController(service as unknown as AsignacionPilotoService);
  });

  describe("delegation to AsignacionPilotoService", () => {
    it("assign() forwards unitId, body, and the actor's employeeId", async () => {
      const dto = { idEmpleado: "piloto-1" } as never;
      service.assign.mockResolvedValue({ id: "ap1" });

      const result = await controller.assign("1", dto, makeRequest("actor-1"));

      expect(result).toEqual({ id: "ap1" });
      expect(service.assign).toHaveBeenCalledWith("1", dto, "actor-1");
    });

    it("reassign() forwards unitId, body, and the actor's employeeId", async () => {
      const dto = { idEmpleado: "piloto-2" } as never;
      service.reassign.mockResolvedValue({ id: "ap1" });

      await controller.reassign("2", dto, makeRequest("actor-2"));

      expect(service.reassign).toHaveBeenCalledWith("2", dto, "actor-2");
    });

    it("unassign() forwards unitId and the actor's employeeId", async () => {
      await controller.unassign("1", makeRequest("actor-3"));

      expect(service.unassign).toHaveBeenCalledWith("1", "actor-3");
    });

    it("getOwnUnit() forwards only the pilot's own employeeId, never a route param", async () => {
      service.getOwnUnit.mockResolvedValue({ idUnidad: "7" });

      const result = await controller.getOwnUnit(makeRequest("pilot-1"));

      expect(result).toEqual({ idUnidad: "7" });
      expect(service.getOwnUnit).toHaveBeenCalledWith("pilot-1");
    });

    it("getOwnStops() forwards only the pilot's own employeeId, never a route param", async () => {
      const stops = [{ idLineaParada: "3", idParada: "9", nombre: "Centro", orden: 1 }];
      service.getOwnStops.mockResolvedValue(stops);

      const result = await controller.getOwnStops(makeRequest("pilot-1"));

      expect(result).toEqual(stops);
      expect(service.getOwnStops).toHaveBeenCalledWith("pilot-1");
    });

    it("reportOwnLocation() forwards the body and the pilot's own employeeId, never a route param", async () => {
      const dto = { idLineaParada: "7" } as never;
      service.reportOwnLocation.mockResolvedValue({ idLineaParadaActual: "7" });

      await controller.reportOwnLocation(dto, makeRequest("pilot-1"));

      expect(service.reportOwnLocation).toHaveBeenCalledWith("pilot-1", dto);
    });
  });

  describe("guard, permission, and filter wiring", () => {
    it("guards the entire controller with AuthenticationGuard", () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, AsignacionPilotoController);
      expect(guards).toContain(AuthenticationGuard);
    });

    it("applies DomainExceptionFilter at the controller level", () => {
      const filters = Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, AsignacionPilotoController);
      expect(filters).toContain(DomainExceptionFilter);
    });

    it.each(["assign", "reassign", "unassign"])(
      "requires FLOTA_GESTIONAR permission on %s()",
      (method) => {
        const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler(method));
        expect(permissions).toEqual([FLOTA_GESTIONAR]);
      },
    );

    it.each(["getOwnUnit", "getOwnStops"])(
      "requires UNIDAD_ASIGNADA_CONSULTAR permission on %s()",
      (method) => {
        const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler(method));
        expect(permissions).toEqual([UNIDAD_ASIGNADA_CONSULTAR]);
      },
    );

    it("requires METRICAS_UNIDAD_REPORTAR permission on reportOwnLocation()", () => {
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler("reportOwnLocation"));
      expect(permissions).toEqual([METRICAS_UNIDAD_REPORTAR]);
    });
  });
});
