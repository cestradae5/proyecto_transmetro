// PersonalRolesController tests (mocked service). Verifies delegation to
// PersonalService.findRoles() and the guard, permission and route metadata.

import { jest } from "@jest/globals";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../authentication/permissions.decorator.js";
import type { RoleResponseDto } from "./dto/role-response.dto.js";
import { PersonalRolesController } from "./personal-roles.controller.js";
import type { PersonalService } from "./personal.service.js";

describe("PersonalRolesController", () => {
  let service: { findRoles: jest.MockedFunction<PersonalService["findRoles"]> };
  let controller: PersonalRolesController;

  beforeEach(() => {
    service = { findRoles: jest.fn() };
    controller = new PersonalRolesController(service as unknown as PersonalService);
  });

  it("findRoles() delegates to service.findRoles", async () => {
    const roles: RoleResponseDto[] = [{ id: "2", code: "PILOTO", name: "Piloto" }];
    service.findRoles.mockResolvedValue(roles);

    const result = await controller.findRoles();

    expect(service.findRoles).toHaveBeenCalledTimes(1);
    expect(result).toBe(roles);
  });

  it("propagates service errors unchanged", async () => {
    const error = new Error("boom");
    service.findRoles.mockRejectedValue(error);

    await expect(controller.findRoles()).rejects.toBe(error);
  });

  describe("guard, permission and route metadata", () => {
    it("requires AuthenticationGuard at the controller level", () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, PersonalRolesController) as unknown[];

      expect(guards).toContain(AuthenticationGuard);
    });

    it("is mounted at personal/roles", () => {
      expect(Reflect.getMetadata(PATH_METADATA, PersonalRolesController)).toBe("personal/roles");
    });

    it("requires EMPLEADOS_PERFILES_ADMINISTRAR permission on findRoles()", () => {
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, PersonalRolesController.prototype.findRoles),
      ).toEqual(["EMPLEADOS_PERFILES_ADMINISTRAR"]);
    });
  });
});
