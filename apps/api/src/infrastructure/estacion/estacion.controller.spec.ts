// PR#2 infraestructura-hardening — EstacionController tests (mocked service).

import { jest } from "@jest/globals";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { CreateEstacionDto, EstadoEstacion } from "./dto/create-estacion.dto.js";
import { EstacionResponseDto } from "./dto/estacion-response.dto.js";
import { UpdateEstacionDto } from "./dto/update-estacion.dto.js";
import { EstacionController } from "./estacion.controller.js";
import type { EstacionService } from "./estacion.service.js";

type MockEstacionService = {
  create: jest.MockedFunction<EstacionService["create"]>;
  findAll: jest.MockedFunction<EstacionService["findAll"]>;
  findOne: jest.MockedFunction<EstacionService["findOne"]>;
  update: jest.MockedFunction<EstacionService["update"]>;
  remove: jest.MockedFunction<EstacionService["remove"]>;
};

function makeMockService(): MockEstacionService {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function makeEstacionResponse(
  overrides: Partial<EstacionResponseDto> = {},
): EstacionResponseDto {
  return {
    idEstacion: "1",
    nombreEstacion: "Estación Central",
    latitud: 14.6349,
    longitud: -90.5069,
    estadoEstacion: EstadoEstacion.ACTIVA,
    idParada: undefined,
    ...overrides,
  };
}

describe("EstacionController", () => {
  let service: MockEstacionService;
  let controller: EstacionController;

  beforeEach(() => {
    service = makeMockService();
    controller = new EstacionController(service as unknown as EstacionService);
  });

  describe("delegation to EstacionService", () => {
    it("create() delegates to service.create with the request body", async () => {
      const dto: CreateEstacionDto = {
        nombreEstacion: "Estación Central",
        latitud: 14.6349,
        longitud: -90.5069,
        estadoEstacion: EstadoEstacion.ACTIVA,
      };
      const created = makeEstacionResponse();
      service.create.mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });

    it("findAll() delegates to service.findAll", async () => {
      const estaciones = [makeEstacionResponse(), makeEstacionResponse({ idEstacion: "2" })];
      service.findAll.mockResolvedValue(estaciones);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(estaciones);
    });

    it("findOne() delegates to service.findOne with the id param", async () => {
      const estacion = makeEstacionResponse();
      service.findOne.mockResolvedValue(estacion);

      const result = await controller.findOne("1");

      expect(service.findOne).toHaveBeenCalledWith("1");
      expect(result).toEqual(estacion);
    });

    it("update() delegates to service.update with id and body", async () => {
      const dto: UpdateEstacionDto = { nombreEstacion: "Renombrada" };
      const updated = makeEstacionResponse({ nombreEstacion: "Renombrada" });
      service.update.mockResolvedValue(updated);

      const result = await controller.update("1", dto);

      expect(service.update).toHaveBeenCalledWith("1", dto);
      expect(result).toEqual(updated);
    });

    it("remove() delegates to service.remove with the id param", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("1");

      expect(service.remove).toHaveBeenCalledWith("1");
    });
  });

  describe("guard and permission metadata", () => {
    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, EstacionController) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it.each([
      ["create", "create"],
      ["findAll", "findAll"],
      ["findOne", "findOne"],
      ["update", "update"],
      ["remove", "remove"],
    ])("requires INFRAESTRUCTURA_GESTIONAR permission on %s()", (_label, method) => {
      const handler = (EstacionController.prototype as unknown as Record<string, () => void>)[
        method
      ]!;
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler);

      expect(permissions).toEqual(["INFRAESTRUCTURA_GESTIONAR"]);
    });
  });
});
