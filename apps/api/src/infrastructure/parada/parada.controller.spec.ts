// PR#2 infraestructura-hardening — ParadaController tests (mocked service).
// Verifies (a) each endpoint delegates to the correct ParadaService method
// with the correct arguments, and (b) AuthenticationGuard + @Permissions
// metadata are present on every handler, mirroring the decorator-metadata
// assertion style used in permissions.decorator.spec.ts.

import { jest } from "@jest/globals";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { CreateParadaDto } from "./dto/create-parada.dto.js";
import { UpdateParadaDto } from "./dto/update-parada.dto.js";
import { ParadaResponseDto } from "./dto/parada-response.dto.js";
import { EstadoParada } from "./parada.entity.js";
import { ParadaController } from "./parada.controller.js";
import type { ParadaService } from "./parada.service.js";

type MockParadaService = {
  create: jest.MockedFunction<ParadaService["create"]>;
  findAll: jest.MockedFunction<ParadaService["findAll"]>;
  findOne: jest.MockedFunction<ParadaService["findOne"]>;
  update: jest.MockedFunction<ParadaService["update"]>;
  remove: jest.MockedFunction<ParadaService["remove"]>;
};

function makeMockService(): MockParadaService {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function makeParada(overrides: Partial<ParadaResponseDto> = {}): ParadaResponseDto {
  return {
    idParada: 1,
    nombreParada: "Parada Central",
    latitud: 14.6349,
    longitud: -90.5069,
    estadoParada: EstadoParada.ACTIVA,
    esEstacion: false,
    idEstacion: null,
    ...overrides,
  };
}

describe("ParadaController", () => {
  let service: MockParadaService;
  let controller: ParadaController;

  beforeEach(() => {
    service = makeMockService();
    controller = new ParadaController(service as unknown as ParadaService);
  });

  describe("delegation to ParadaService", () => {
    it("create() delegates to service.create with the request body", async () => {
      const dto: CreateParadaDto = {
        nombreParada: "Parada Central",
        latitud: 14.6349,
        longitud: -90.5069,
        estadoParada: EstadoParada.ACTIVA,
      };
      const created = makeParada();
      service.create.mockResolvedValue(created);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(created);
    });

    it("findAll() delegates to service.findAll", async () => {
      const paradas = [makeParada(), makeParada({ idParada: 2, esEstacion: true, idEstacion: 5 })];
      service.findAll.mockResolvedValue(paradas);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(paradas);
    });

    it("findOne() delegates to service.findOne with the id param", async () => {
      const parada = makeParada();
      service.findOne.mockResolvedValue(parada);

      const result = await controller.findOne("1");

      expect(service.findOne).toHaveBeenCalledWith("1");
      expect(result).toEqual(parada);
    });

    it("update() delegates to service.update with id and body", async () => {
      const dto: UpdateParadaDto = { nombreParada: "Renombrada" };
      const updated = makeParada({ nombreParada: "Renombrada" });
      service.update.mockResolvedValue(updated);

      const result = await controller.update("1", dto);

      expect(service.update).toHaveBeenCalledWith("1", dto);
      expect(result).toEqual(updated);
    });

    it("remove() delegates to service.remove with id and force=false when query is absent", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("1", undefined);

      expect(service.remove).toHaveBeenCalledWith("1", false);
    });

    it("remove() forwards force=true only when the query string is exactly 'true'", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("1", "true");
      expect(service.remove).toHaveBeenCalledWith("1", true);

      service.remove.mockClear();
      await controller.remove("1", "1");
      expect(service.remove).toHaveBeenCalledWith("1", false);
    });
  });

  describe("guard and permission metadata", () => {
    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, ParadaController) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it.each([
      ["create", "create"],
      ["findAll", "findAll"],
      ["findOne", "findOne"],
      ["update", "update"],
      ["remove", "remove"],
    ])("requires INFRAESTRUCTURA_GESTIONAR permission on %s()", (_label, method) => {
      const handler = (ParadaController.prototype as unknown as Record<string, () => void>)[
        method
      ]!;
      const permissions = Reflect.getMetadata(PERMISSIONS_KEY, handler);

      expect(permissions).toEqual(["INFRAESTRUCTURA_GESTIONAR"]);
    });
  });
});
