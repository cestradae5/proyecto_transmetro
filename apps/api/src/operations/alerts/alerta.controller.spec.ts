import { jest } from "@jest/globals";
import { HttpStatus } from "@nestjs/common";
import {
  EXCEPTION_FILTERS_METADATA,
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { AlertaController } from "./alerta.controller.js";
import type { AlertaService } from "./alerta.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

const handler = (name: string) =>
  (AlertaController.prototype as unknown as Record<string, () => void>)[name]!;

describe("AlertaController", () => {
  let service: Record<
    "getDestinations" | "listSent" | "create" | "getMyStation" | "updateStatus",
    AnyMock
  >;
  let controller: AlertaController;
  const request = { user: { employeeId: "5" } };

  beforeEach(() => {
    service = {
      getDestinations: jest.fn(),
      listSent: jest.fn(),
      create: jest.fn(),
      getMyStation: jest.fn(),
      updateStatus: jest.fn(),
    };
    controller = new AlertaController(service as unknown as AlertaService);
  });

  it("is guarded, filtered and mounted at operations/alerts", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AlertaController)).toContain(AuthenticationGuard);
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, AlertaController)).toContain(
      DomainExceptionFilter,
    );
    expect(Reflect.getMetadata(PATH_METADATA, AlertaController)).toBe("operations/alerts");
  });

  it.each([
    ["getDestinations", RequestMethod.GET, "my-unit/destinations", "ALERTAS_UNIDAD_GESTIONAR"],
    ["listSent", RequestMethod.GET, "sent", "ALERTAS_UNIDAD_GESTIONAR"],
    ["create", RequestMethod.POST, "/", "ALERTAS_UNIDAD_GESTIONAR"],
    ["getMyStation", RequestMethod.GET, "my-station", "ALERTAS_ESTACION_GESTIONAR"],
    ["updateStatus", RequestMethod.PATCH, ":id/status", "ALERTAS_ESTACION_GESTIONAR"],
  ])("%s is %s %s and requires %s (S10)", (name, method, path, permission) => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler(name))).toBe(method);
    expect(Reflect.getMetadata(PATH_METADATA, handler(name))).toBe(path);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(name))).toEqual([permission]);
  });

  it("create answers 201", () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler("create"))).toBe(HttpStatus.CREATED);
  });

  it("delegates every route with request.user.employeeId", async () => {
    const dto = { tipoAlerta: "ACCIDENTE" as const, idEstacionDestino: "22" };
    const status = { estado: "RECIBIDA" as const, observacion: "ok" };
    for (const key of Object.keys(service) as (keyof typeof service)[]) {
      service[key].mockResolvedValue(key);
    }

    await expect(controller.getDestinations(request)).resolves.toBe("getDestinations");
    await expect(controller.listSent(request)).resolves.toBe("listSent");
    await expect(controller.create(request, dto)).resolves.toBe("create");
    await expect(controller.getMyStation(request)).resolves.toBe("getMyStation");
    await expect(controller.updateStatus(request, "100", status)).resolves.toBe("updateStatus");

    expect(service.getDestinations).toHaveBeenCalledWith("5");
    expect(service.listSent).toHaveBeenCalledWith("5");
    expect(service.create).toHaveBeenCalledWith("5", dto);
    expect(service.getMyStation).toHaveBeenCalledWith("5");
    expect(service.updateStatus).toHaveBeenCalledWith("5", "100", status);
  });
});
