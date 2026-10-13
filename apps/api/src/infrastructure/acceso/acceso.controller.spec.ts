// AccesoController tests (mocked service).
// Verifies delegation to AccesoService and routing/guard/permission metadata.

import { jest } from "@jest/globals";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../../authentication/permissions.decorator.js";
import { AccesoController } from "./acceso.controller.js";
import { TipoAcceso } from "./acceso.entity.js";
import type { AccesoService } from "./acceso.service.js";

type AnyMock = jest.Mock<(...args: any[]) => any>;

type MockAccesoService = Record<
  "list" | "create" | "findOne" | "update" | "remove",
  AnyMock
>;

function makeMockService(): MockAccesoService {
  return {
    list: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
}

function handler(method: string): () => void {
  return (AccesoController.prototype as unknown as Record<string, () => void>)[
    method
  ]!;
}

describe("AccesoController", () => {
  let service: MockAccesoService;
  let controller: AccesoController;

  beforeEach(() => {
    service = makeMockService();
    controller = new AccesoController(service as unknown as AccesoService);
  });

  const request = { user: { employeeId: "7" } } as unknown as Record<string, any>;

  describe("delegation to AccesoService", () => {
    it("list() forwards the parada id", async () => {
      service.list.mockResolvedValue([]);

      await expect(controller.list("1")).resolves.toEqual([]);
      expect(service.list).toHaveBeenCalledWith("1");
    });

    it("create() forwards the parada id and body", async () => {
      const dto = {
        nombreAcceso: "Acceso norte",
        latitud: 14.6,
        longitud: -90.5,
        tipoAcceso: TipoAcceso.PEATONAL,
      };
      service.create.mockResolvedValue({ idAcceso: "10" });

      await expect(controller.create("1", dto, request)).resolves.toEqual({
        idAcceso: "10",
      });
      expect(service.create).toHaveBeenCalledWith("1", dto, "7");
    });

    it("findOne() forwards parada and acceso ids", async () => {
      service.findOne.mockResolvedValue({ idAcceso: "10" });

      await controller.findOne("1", "10");

      expect(service.findOne).toHaveBeenCalledWith("1", "10");
    });

    it("update() forwards parada id, acceso id and body", async () => {
      const dto = { nombreAcceso: "Acceso sur" };
      service.update.mockResolvedValue({ idAcceso: "10" });

      await controller.update("1", "10", dto, request);

      expect(service.update).toHaveBeenCalledWith("1", "10", dto, "7");
    });

    it("remove() forwards parada and acceso ids", async () => {
      service.remove.mockResolvedValue(undefined);

      await controller.remove("1", "10", request);

      expect(service.remove).toHaveBeenCalledWith("1", "10", "7");
    });
  });

  describe("routing, guard and permission metadata", () => {
    it("is mounted under infrastructure/paradas/:id/accesos", () => {
      expect(Reflect.getMetadata(PATH_METADATA, AccesoController)).toBe(
        "infrastructure/paradas/:id/accesos"
      );
    });

    it.each([
      ["list", "/"],
      ["create", "/"],
      ["findOne", ":accesoId"],
      ["update", ":accesoId"],
      ["remove", ":accesoId"],
    ])("maps %s() to path %s", (method, path) => {
      expect(Reflect.getMetadata(PATH_METADATA, handler(method))).toBe(path);
    });

    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        AccesoController
      ) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it.each(["list", "create", "findOne", "update", "remove"])(
      "requires INFRAESTRUCTURA_GESTIONAR permission on %s()",
      (method) => {
        expect(Reflect.getMetadata(PERMISSIONS_KEY, handler(method))).toEqual([
          "INFRAESTRUCTURA_GESTIONAR",
        ]);
      }
    );
  });
});
