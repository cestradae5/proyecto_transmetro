// PR#2 infraestructura-hardening — ParqueoController tests (mocked service).

import { jest } from "@jest/globals";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { CreateParqueoDto, EstadoParqueo, TipoParqueo } from "./dto/create-parqueo.dto.js";
import { ParqueoResponseDto } from "./dto/parqueo-response.dto.js";
import { UpdateParqueoDto } from "./dto/update-parqueo.dto.js";
import { ParqueoController } from "./parqueo.controller.js";
import type { ParqueoService } from "./parqueo.service.js";

type MockParqueoService = {
  create: jest.MockedFunction<ParqueoService["create"]>;
  findAll: jest.MockedFunction<ParqueoService["findAll"]>;
  findOne: jest.MockedFunction<ParqueoService["findOne"]>;
  update: jest.MockedFunction<ParqueoService["update"]>;
  remove: jest.MockedFunction<ParqueoService["remove"]>;
};

function makeMockService(): MockParqueoService {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function makeParqueoResponse(
  overrides: Partial<ParqueoResponseDto> = {},
): ParqueoResponseDto {
  return {
    idParqueo: "1",
    nombreParqueo: "Parqueo Central",
    tipoParqueo: TipoParqueo.CENTRAL,
    direccion: "1a avenida",
    latitud: 14.6349,
    longitud: -90.5069,
    capacidadUnidades: 20,
    estadoParqueo: EstadoParqueo.ACTIVO,
    idEstacion: "1",
    ...overrides,
  };
}

describe("ParqueoController", () => {
  let service: MockParqueoService;
  let controller: ParqueoController;

  beforeEach(() => {
    service = makeMockService();
    controller = new ParqueoController(service as unknown as ParqueoService);
  });

  describe("delegation to ParqueoService", () => {
    it("create() delegates to service.create with the request body", async () => {
      const dto: CreateParqueoDto = {
        nombreParqueo: "Parqueo Central",
        tipoParqueo: TipoParqueo.CENTRAL,
        direccion: "1a avenida",
        latitud: 14.6349,
        longitud: -90.5069,
        capacidadUnidades: 20,
        estadoParqueo: EstadoParqueo.ACTIVO,
        idEstacion: "1",
      };
      const created = makeParqueoResponse();
      service.create.mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });

    it("findAll() delegates to service.findAll", async () => {
      const parqueos = [makeParqueoResponse(), makeParqueoResponse({ idParqueo: "2" })];
      service.findAll.mockResolvedValue(parqueos);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(parqueos);
    });

    it("findOne() delegates to service.findOne with the id param", async () => {
      const parqueo = makeParqueoResponse();
      service.findOne.mockResolvedValue(parqueo);

      const result = await controller.findOne("1");

      expect(service.findOne).toHaveBeenCalledWith("1");
      expect(result).toEqual(parqueo);
    });

    it("update() delegates to service.update with id and body", async () => {
      const dto: UpdateParqueoDto = { nombreParqueo: "Renombrado" };
      const updated = makeParqueoResponse({ nombreParqueo: "Renombrado" });
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
      const guards = Reflect.getMetadata(GUARDS_METADATA, ParqueoController) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it.each([
      ["create", "create"],
      ["findAll", "findAll"],
      ["findOne", "findOne"],
      ["update", "update"],
      ["remove", "remove"],
    ])("requires INFRAESTRUCTURA_GESTIONAR permission on %s()", (_label, method) => {
      const handler = (ParqueoController.prototype as unknown as Record<string, () => void>)[
        method
      ]!;
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler);

      expect(permissions).toEqual(["INFRAESTRUCTURA_GESTIONAR"]);
    });
  });
});
