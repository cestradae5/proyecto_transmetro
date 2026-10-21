// AfectacionController tests (mocked service).
// Verifies delegation to AfectacionService and guard/permission/route metadata.
// An afectación can be edited (PATCH /:id) but not closed or deleted.

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

type MockAfectacionService = Record<"create" | "update" | "findAll" | "findOne", AnyMock>;

function makeMockService(): MockAfectacionService {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
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

  const request = { user: { employeeId: "7" } } as unknown as Record<string, any>;

  describe("delegation to AfectacionService", () => {
    it("create() forwards the body", async () => {
      const dto = { motivo: "X" } as never;
      service.create.mockResolvedValue({ idAfectacion: "7" });

      await expect(controller.create(dto, request)).resolves.toEqual({
        idAfectacion: "7",
      });
      expect(service.create).toHaveBeenCalledWith(dto, "7");
    });

    it("update() forwards the id, the body and the actor", async () => {
      const dto = { accion: "ACTIVAR" } as never;
      service.update.mockResolvedValue({ idAfectacion: "7" });

      await expect(controller.update("7", dto, request)).resolves.toEqual({ idAfectacion: "7" });
      expect(service.update).toHaveBeenCalledWith("7", dto, "7");
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
  });

  describe("routing metadata", () => {
    it("exposes no close or delete handler", () => {
      const proto = AfectacionController.prototype as unknown as Record<string, unknown>;

      expect(proto.close).toBeUndefined();
      expect(proto.remove).toBeUndefined();
    });

    it("maps create() to POST and findAll()/findOne() to GET", () => {
      expect(Reflect.getMetadata(METHOD_METADATA, handler("create"))).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(METHOD_METADATA, handler("findAll"))).toBe(RequestMethod.GET);
      expect(Reflect.getMetadata(METHOD_METADATA, handler("findOne"))).toBe(RequestMethod.GET);
      expect(Reflect.getMetadata(PATH_METADATA, handler("findOne"))).toBe(":id");
      expect(Reflect.getMetadata(METHOD_METADATA, handler("update"))).toBe(RequestMethod.PATCH);
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

    it.each(["create", "update", "findAll", "findOne"])(
      "requires INFRAESTRUCTURA_GESTIONAR permission on %s()",
      (method) => {
        expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(method))).toEqual([
          "INFRAESTRUCTURA_GESTIONAR",
        ]);
      }
    );
  });
});
