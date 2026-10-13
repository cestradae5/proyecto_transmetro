// LineaMunicipalidadController tests (mocked service).
// Verifies delegation and routing/guard/permission/HTTP-code metadata.

import { jest } from "@jest/globals";
import { HttpStatus, RequestMethod } from "@nestjs/common";
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { LineaMunicipalidadController } from "./linea-municipalidad.controller.js";
import type { LineaMunicipalidadService } from "./linea-municipalidad.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockLinkService = Record<"list" | "add" | "remove", AnyMock>;

function handler(method: string): () => void {
  return (
    LineaMunicipalidadController.prototype as unknown as Record<
      string,
      () => void
    >
  )[method]!;
}

describe("LineaMunicipalidadController", () => {
  let service: MockLinkService;
  let controller: LineaMunicipalidadController;

  beforeEach(() => {
    service = { list: jest.fn(), add: jest.fn(), remove: jest.fn() };
    controller = new LineaMunicipalidadController(
      service as unknown as LineaMunicipalidadService
    );
  });

  const request = { user: { employeeId: "7" } } as unknown as Record<string, any>;

  describe("delegation to LineaMunicipalidadService", () => {
    it("list() forwards the línea id", async () => {
      service.list.mockResolvedValue([]);

      await controller.list("3");

      expect(service.list).toHaveBeenCalledWith("3");
    });

    it("add() forwards línea id and body", async () => {
      const dto = { idMunicipalidad: "4" };
      service.add.mockResolvedValue({ idLinea: "3", idMunicipalidad: "4" });

      await expect(controller.add("3", dto, request)).resolves.toEqual({
        idLinea: "3",
        idMunicipalidad: "4",
      });
      expect(service.add).toHaveBeenCalledWith("3", dto, "7");
    });

    it("remove() forwards línea id and municipalidad id", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("3", "4", request);

      expect(service.remove).toHaveBeenCalledWith("3", "4", "7");
    });
  });

  describe("routing metadata", () => {
    it("is mounted as a sub-resource of infrastructure/lineas", () => {
      expect(
        Reflect.getMetadata(PATH_METADATA, LineaMunicipalidadController)
      ).toBe("infrastructure/lineas/:id/municipalidades");
    });

    it.each([
      ["list", RequestMethod.GET, "/"],
      ["add", RequestMethod.POST, "/"],
      ["remove", RequestMethod.DELETE, ":municipalidadId"],
    ])("%s() is mapped to %s %s", (method, verb, path) => {
      expect(Reflect.getMetadata(METHOD_METADATA, handler(method))).toBe(verb);
      expect(Reflect.getMetadata(PATH_METADATA, handler(method))).toBe(path);
    });

    it("add() responds 201 and remove() responds 204", () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler("add"))).toBe(
        HttpStatus.CREATED
      );
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler("remove"))).toBe(
        HttpStatus.NO_CONTENT
      );
    });
  });

  describe("guard and permission metadata", () => {
    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        LineaMunicipalidadController
      ) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it.each(["list", "add", "remove"])(
      "requires INFRAESTRUCTURA_GESTIONAR permission on %s()",
      (method) => {
        expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(method))).toEqual([
          "INFRAESTRUCTURA_GESTIONAR",
        ]);
      }
    );
  });
});
