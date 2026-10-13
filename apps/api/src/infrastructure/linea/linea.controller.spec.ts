// PR#3 infraestructura-hardening — LineaController tests (mocked service).
// Verifies delegation to LineaService and guard/permission/HTTP-code metadata.

import { jest } from "@jest/globals";
import { HttpStatus } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { LineaController } from "./linea.controller.js";
import type { LineaService } from "./linea.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockLineaService = Record<
  | "create"
  | "findAll"
  | "findOne"
  | "update"
  | "remove"
  | "listParadas"
  | "addParada"
  | "updateParada"
  | "removeParada"
  | "reorderParadas",
  AnyMock
>;

function makeMockService(): MockLineaService {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    listParadas: jest.fn(),
    addParada: jest.fn(),
    updateParada: jest.fn(),
    removeParada: jest.fn(),
    reorderParadas: jest.fn(),
  };
}

function handler(method: string): () => void {
  return (LineaController.prototype as unknown as Record<string, () => void>)[
    method
  ]!;
}

describe("LineaController", () => {
  let service: MockLineaService;
  let controller: LineaController;

  beforeEach(() => {
    service = makeMockService();
    controller = new LineaController(service as unknown as LineaService);
  });

  const request = { user: { employeeId: "7" } } as unknown as Record<string, any>;

  describe("delegation to LineaService", () => {
    it("create() forwards the body", async () => {
      const dto = { numeroLinea: "L1" } as never;
      service.create.mockResolvedValue({ idLinea: "1" });

      await expect(controller.create(dto, request)).resolves.toEqual({ idLinea: "1" });
      expect(service.create).toHaveBeenCalledWith(dto, "7");
    });

    it("findAll() delegates", async () => {
      service.findAll.mockResolvedValue([]);

      await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
    });

    it("findOne() forwards the id", async () => {
      service.findOne.mockResolvedValue({ idLinea: "1" });

      await controller.findOne("1");

      expect(service.findOne).toHaveBeenCalledWith("1");
    });

    it("update() forwards id and body", async () => {
      const dto = { nombreLinea: "X" };
      service.update.mockResolvedValue({ idLinea: "1" });

      await controller.update("1", dto, request);

      expect(service.update).toHaveBeenCalledWith("1", dto, "7");
    });

    it("remove() forwards the id", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("1", request);

      expect(service.remove).toHaveBeenCalledWith("1", "7");
    });

    it("listParadas() forwards the línea id", async () => {
      service.listParadas.mockResolvedValue([]);

      await controller.listParadas("1");

      expect(service.listParadas).toHaveBeenCalledWith("1");
    });

    it("addParada() forwards línea id and body", async () => {
      const dto = { idParada: "5", orden: 1, minutosHastaSiguiente: 5 };
      service.addParada.mockResolvedValue({ idLineaParada: "100" });

      await expect(controller.addParada("1", dto, request)).resolves.toEqual({
        idLineaParada: "100",
      });
      expect(service.addParada).toHaveBeenCalledWith("1", dto, "7");
    });

    it("updateParada() forwards línea id, record id and body", async () => {
      const dto = { orden: 2, minutosHastaSiguiente: 7 };
      service.updateParada.mockResolvedValue({ idLineaParada: "100" });

      await controller.updateParada("1", "100", dto, request);

      expect(service.updateParada).toHaveBeenCalledWith("1", "100", dto, "7");
    });

    it("removeParada() forwards línea id and record id", async () => {
      service.removeParada.mockResolvedValue(undefined);

      await controller.removeParada("1", "100", request);

      expect(service.removeParada).toHaveBeenCalledWith("1", "100", "7");
    });

    it("reorderParadas() forwards línea id and body", async () => {
      const dto = { idsLineaParada: ["101", "100"] };
      service.reorderParadas.mockResolvedValue([{ idLineaParada: "101" }]);

      await expect(controller.reorderParadas("1", dto, request)).resolves.toEqual([
        { idLineaParada: "101" },
      ]);
      expect(service.reorderParadas).toHaveBeenCalledWith("1", dto, "7");
    });
  });

  describe("routing metadata for the parada sequence", () => {
    it.each([
      ["listParadas", RequestMethod.GET, ":id/paradas"],
      ["addParada", RequestMethod.POST, ":id/paradas"],
      ["updateParada", RequestMethod.PATCH, ":id/paradas/:lineaParadaId"],
      ["removeParada", RequestMethod.DELETE, ":id/paradas/:lineaParadaId"],
      ["reorderParadas", RequestMethod.PUT, ":id/paradas/orden"],
    ])("%s() is mapped to %s %s", (method, verb, path) => {
      expect(Reflect.getMetadata(METHOD_METADATA, handler(method))).toBe(verb);
      expect(Reflect.getMetadata(PATH_METADATA, handler(method))).toBe(path);
    });

    it("addParada() responds 201 and removeParada() responds 204", () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler("addParada"))).toBe(
        HttpStatus.CREATED
      );
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, handler("removeParada"))
      ).toBe(HttpStatus.NO_CONTENT);
    });

    it("keeps the controller under infrastructure/lineas without an /api prefix", () => {
      expect(Reflect.getMetadata(PATH_METADATA, LineaController)).toBe(
        "infrastructure/lineas"
      );
    });
  });

  describe("guard and permission metadata", () => {
    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        LineaController
      ) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it.each([
      "create",
      "findAll",
      "findOne",
      "update",
      "remove",
      "listParadas",
      "addParada",
      "updateParada",
      "removeParada",
      "reorderParadas",
    ])("requires INFRAESTRUCTURA_GESTIONAR permission on %s()", (method) => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(method))).toEqual([
        "INFRAESTRUCTURA_GESTIONAR",
      ]);
    });
  });
});
