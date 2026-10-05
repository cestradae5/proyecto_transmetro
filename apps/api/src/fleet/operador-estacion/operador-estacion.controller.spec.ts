import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { OperadorEstacionController } from "./operador-estacion.controller.js";
import type { OperadorEstacionService } from "./operador-estacion.service.js";

describe("OperadorEstacionController", () => {
  let service: { listOperators: jest.Mock<(...args: any[]) => any> };
  let controller: OperadorEstacionController;

  beforeEach(() => {
    service = { listOperators: jest.fn() };
    controller = new OperadorEstacionController(service as unknown as OperadorEstacionService);
  });

  it("list() delegates to OperadorEstacionService.listOperators()", async () => {
    const operators = [{ idEmpleado: "1", nombre: "Ana", idEstacionActual: "10" }];
    service.listOperators.mockResolvedValue(operators);

    expect(await controller.list()).toEqual(operators);
  });

  it("is guarded, filtered, mounted at fleet/station-operators and requires FLOTA_GESTIONAR", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperadorEstacionController)).toContain(
      AuthenticationGuard,
    );
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, OperadorEstacionController)).toContain(
      DomainExceptionFilter,
    );
    expect(Reflect.getMetadata("path", OperadorEstacionController)).toBe("fleet/station-operators");
    const handler = (OperadorEstacionController.prototype as unknown as Record<string, () => void>)[
      "list"
    ]!;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["FLOTA_GESTIONAR"]);
  });
});
