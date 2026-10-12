// MunicipalidadController tests (mocked service).
// Verifies delegation to MunicipalidadService and guard/permission metadata.

import { jest } from "@jest/globals";
import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { MunicipalidadController } from "./municipalidad.controller.js";
import type { MunicipalidadService } from "./municipalidad.service.js";
import type { LineaMunicipalidadService } from "./linea-municipalidad.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockMunicipalidadService = Record<
  "create" | "findAll" | "findOne" | "update" | "remove",
  AnyMock
>;

function makeMockService(): MockMunicipalidadService {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function handler(method: string): () => void {
  return (
    MunicipalidadController.prototype as unknown as Record<string, () => void>
  )[method]!;
}

describe("MunicipalidadController", () => {
  let service: MockMunicipalidadService;
  let linkService: Record<"listLineas", AnyMock>;
  let controller: MunicipalidadController;

  beforeEach(() => {
    service = makeMockService();
    linkService = { listLineas: jest.fn() };
    controller = new MunicipalidadController(
      service as unknown as MunicipalidadService,
      linkService as unknown as LineaMunicipalidadService
    );
  });

  describe("líneas of a municipalidad", () => {
    it("listLineas() forwards the municipalidad id to LineaMunicipalidadService", async () => {
      const lineas = [{ idLinea: "3", numeroLinea: "L3" }];
      linkService.listLineas.mockResolvedValue(lineas);

      await expect(controller.listLineas("4")).resolves.toEqual(lineas);
      expect(linkService.listLineas).toHaveBeenCalledWith("4");
    });

    it("listLineas() is mapped to GET :id/lineas", () => {
      expect(Reflect.getMetadata(METHOD_METADATA, handler("listLineas"))).toBe(
        RequestMethod.GET
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler("listLineas"))).toBe(
        ":id/lineas"
      );
    });
  });

  describe("delegation to MunicipalidadService", () => {
    it("create() forwards the body", async () => {
      const dto = { nombreMunicipalidad: "Mixco", departamento: "Guatemala" };
      service.create.mockResolvedValue({ idMunicipalidad: "1" });

      await expect(controller.create(dto)).resolves.toEqual({
        idMunicipalidad: "1",
      });
      expect(service.create).toHaveBeenCalledWith(dto);
    });

    it("findAll() delegates", async () => {
      service.findAll.mockResolvedValue([]);

      await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
    });

    it("findOne() forwards the id", async () => {
      service.findOne.mockResolvedValue({ idMunicipalidad: "1" });

      await controller.findOne("1");

      expect(service.findOne).toHaveBeenCalledWith("1");
    });

    it("update() forwards id and body", async () => {
      const dto = { departamento: "Sacatepéquez" };
      service.update.mockResolvedValue({ idMunicipalidad: "1" });

      await controller.update("1", dto);

      expect(service.update).toHaveBeenCalledWith("1", dto);
    });

    it("remove() forwards the id", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("1");

      expect(service.remove).toHaveBeenCalledWith("1");
    });
  });

  describe("routing, guard and permission metadata", () => {
    it("is mounted under infrastructure/municipalidades", () => {
      expect(Reflect.getMetadata(PATH_METADATA, MunicipalidadController)).toBe(
        "infrastructure/municipalidades"
      );
    });

    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        MunicipalidadController
      ) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it.each(["create", "findAll", "findOne", "update", "remove", "listLineas"])(
      "requires INFRAESTRUCTURA_GESTIONAR permission on %s()",
      (method) => {
        expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(method))).toEqual([
          "INFRAESTRUCTURA_GESTIONAR",
        ]);
      }
    );
  });
});
