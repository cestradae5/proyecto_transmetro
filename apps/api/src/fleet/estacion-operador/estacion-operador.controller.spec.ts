import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { EstacionOperadorController } from "./estacion-operador.controller.js";
import type { EstacionOperadorService } from "./estacion-operador.service.js";

describe("EstacionOperadorController", () => {
  let service: { getMyStation: jest.Mock<(...args: any[]) => any> };
  let controller: EstacionOperadorController;

  beforeEach(() => {
    service = { getMyStation: jest.fn() };
    controller = new EstacionOperadorController(service as unknown as EstacionOperadorService);
  });

  it("getMyStation() delegates with request.user.employeeId", async () => {
    const payload = { station: { idEstacion: "10" }, lines: [], units: [] };
    service.getMyStation.mockResolvedValue(payload);

    const result = await controller.getMyStation({ user: { employeeId: "5" } });

    expect(result).toBe(payload);
    expect(service.getMyStation).toHaveBeenCalledWith("5");
  });

  it("is guarded, filtered, mounted at fleet/my-station and requires FLOTA_ESTACION_CONSULTAR", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, EstacionOperadorController)).toContain(
      AuthenticationGuard,
    );
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, EstacionOperadorController)).toContain(
      DomainExceptionFilter,
    );
    expect(Reflect.getMetadata("path", EstacionOperadorController)).toBe("fleet/my-station");
    const handler = (
      EstacionOperadorController.prototype as unknown as Record<string, () => void>
    )["getMyStation"]!;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["FLOTA_ESTACION_CONSULTAR"]);
  });
});
