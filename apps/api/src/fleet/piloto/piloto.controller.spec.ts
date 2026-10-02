// PilotoController tests (mocked service): delegation and metadata wiring.

import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { PilotoController } from "./piloto.controller.js";
import type { PilotoService } from "./piloto.service.js";

describe("PilotoController", () => {
  let service: { listEligiblePilots: jest.Mock<(...args: any[]) => any> };
  let controller: PilotoController;

  beforeEach(() => {
    service = { listEligiblePilots: jest.fn() };
    controller = new PilotoController(service as unknown as PilotoService);
  });

  it("list() delegates to PilotoService.listEligiblePilots()", async () => {
    const pilots = [{ idEmpleado: "1", nombre: "Ana", idUnidad: "5" }, { idEmpleado: "2", nombre: "Beto" }];
    service.listEligiblePilots.mockResolvedValue(pilots);

    const result = await controller.list();

    expect(result).toEqual(pilots);
    expect(service.listEligiblePilots).toHaveBeenCalledTimes(1);
  });

  it("guards the controller with AuthenticationGuard", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PilotoController)).toContain(AuthenticationGuard);
  });

  it("applies DomainExceptionFilter at the controller level", () => {
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, PilotoController)).toContain(
      DomainExceptionFilter,
    );
  });

  it("requires FLOTA_GESTIONAR permission on list()", () => {
    const handler = (PilotoController.prototype as unknown as Record<string, () => void>)["list"]!;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["FLOTA_GESTIONAR"]);
  });

  it("is mounted at fleet/pilots", () => {
    expect(Reflect.getMetadata("path", PilotoController)).toBe("fleet/pilots");
  });
});
