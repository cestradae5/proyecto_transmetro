// PR#3 infraestructura-hardening — AfectacionController tests (mocked service).
// Verifies delegation to AfectacionService and guard/permission/route metadata.

import { jest } from "@jest/globals";
import { RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { AfectacionController } from "./afectacion.controller.js";
import type { AfectacionService } from "./afectacion.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockAfectacionService = Record<
  "create" | "findAll" | "findOne" | "update" | "remove" | "close",
  AnyMock
>;

function makeMockService(): MockAfectacionService {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    close: jest.fn(),
  };
}

function handler(method: string): () => void {
  return (
    AfectacionController.prototype as unknown as Record<string, () => void>
  )[method]!;
}

describe("AfectacionController", () => {
  let service: MockAfectacionService;
  let controller: AfectacionController;

  beforeEach(() => {
    service = makeMockService();
    controller = new AfectacionController(
      service as unknown as AfectacionService
    );
  });

  describe("delegation to AfectacionService", () => {
    it("create() forwards the body", async () => {
      const dto = { motivo: "X" } as never;
      service.create.mockResolvedValue({ idAfectacion: "7" });

      await expect(controller.create(dto)).resolves.toEqual({
        idAfectacion: "7",
      });
      expect(service.create).toHaveBeenCalledWith(dto);
    });

    it("findAll() delegates", async () => {
      service.findAll.mockResolvedValue([]);

      await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
    });

    it("findOne() forwards the id", async () => {
      service.findOne.mockResolvedValue({ idAfectacion: "7" });

      await controller.findOne("7");

      expect(service.findOne).toHaveBeenCalledWith("7");
    });

    it("update() forwards id and body", async () => {
      const dto = { motivo: "Reparación ampliada" };
      service.update.mockResolvedValue({ idAfectacion: "7" });

      await controller.update("7", dto);

      expect(service.update).toHaveBeenCalledWith("7", dto);
    });

    it("remove() forwards the id", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("7");

      expect(service.remove).toHaveBeenCalledWith("7");
    });

    it("close() forwards the id and returns the closed afectación", async () => {
      service.close.mockResolvedValue({
        idAfectacion: "7",
        estadoAfectacion: "CERRADA",
      });

      await expect(controller.close("7")).resolves.toEqual({
        idAfectacion: "7",
        estadoAfectacion: "CERRADA",
      });
      expect(service.close).toHaveBeenCalledWith("7");
    });
  });

  describe("routing metadata", () => {
    it("maps close() to PATCH :id/close, distinct from update() PATCH :id", () => {
      expect(Reflect.getMetadata(METHOD_METADATA, handler("close"))).toBe(
        RequestMethod.PATCH
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler("close"))).toBe(
        ":id/close"
      );
      expect(Reflect.getMetadata(PATH_METADATA, handler("update"))).toBe(":id");
    });

    it("keeps the controller under infrastructure/afectaciones without an /api prefix", () => {
      expect(Reflect.getMetadata(PATH_METADATA, AfectacionController)).toBe(
        "infrastructure/afectaciones"
      );
    });
  });

  describe("guard and permission metadata", () => {
    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        AfectacionController
      ) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it.each(["create", "findAll", "findOne", "update", "remove", "close"])(
      "requires INFRAESTRUCTURA_GESTIONAR permission on %s()",
      (method) => {
        expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(method))).toEqual([
          "INFRAESTRUCTURA_GESTIONAR",
        ]);
      }
    );
  });
});
