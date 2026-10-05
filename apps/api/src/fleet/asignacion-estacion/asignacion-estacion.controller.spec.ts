// AsignacionEstacionController tests (mocked service): delegation and metadata.

import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { AsignacionEstacionController } from "./asignacion-estacion.controller.js";
import type { AsignacionEstacionService } from "./asignacion-estacion.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

describe("AsignacionEstacionController", () => {
  let service: { list: AnyMock; assign: AnyMock; reassign: AnyMock; unassign: AnyMock };
  let controller: AsignacionEstacionController;
  const request = { user: { employeeId: "actor-1" } };

  beforeEach(() => {
    service = { list: jest.fn(), assign: jest.fn(), reassign: jest.fn(), unassign: jest.fn() };
    controller = new AsignacionEstacionController(service as unknown as AsignacionEstacionService);
  });

  it("list() forwards the optional idEstacion filter", async () => {
    service.list.mockResolvedValue([]);

    await controller.list("10");

    expect(service.list).toHaveBeenCalledWith("10");
  });

  it("assign() passes the dto and the actor employee id", async () => {
    const dto = { idEmpleado: "1", idEstacion: "2" };

    await controller.assign(dto, request);

    expect(service.assign).toHaveBeenCalledWith(dto, "actor-1");
  });

  it("reassign() passes id, dto and actor", async () => {
    await controller.reassign("a1", { idEstacion: "3" }, request);

    expect(service.reassign).toHaveBeenCalledWith("a1", { idEstacion: "3" }, "actor-1");
  });

  it("unassign() passes id and actor", async () => {
    await controller.unassign("a1", request);

    expect(service.unassign).toHaveBeenCalledWith("a1", "actor-1");
  });

  it("guards and filters the controller and mounts it at fleet/station-assignments", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AsignacionEstacionController)).toContain(
      AuthenticationGuard,
    );
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, AsignacionEstacionController)).toContain(
      DomainExceptionFilter,
    );
    expect(Reflect.getMetadata("path", AsignacionEstacionController)).toBe(
      "fleet/station-assignments",
    );
  });

  it.each(["list", "assign", "reassign", "unassign"])(
    "requires FLOTA_GESTIONAR on %s()",
    (name) => {
      const handler = (AsignacionEstacionController.prototype as unknown as Record<string, () => void>)[
        name
      ]!;
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["FLOTA_GESTIONAR"]);
    },
  );
});
