import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../shared/errors/domain-exception.filter.js";
import { ProfileController } from "./profile.controller.js";
import type { ProfileService } from "./profile.service.js";

describe("ProfileController", () => {
  let service: { getProfile: jest.Mock<(...args: any[]) => any> };
  let controller: ProfileController;

  beforeEach(() => {
    service = { getProfile: jest.fn() };
    controller = new ProfileController(service as unknown as ProfileService);
  });

  it("getProfile() delegates with request.user.employeeId", async () => {
    const payload = { employeeId: "5", name: "Ana" };
    service.getProfile.mockResolvedValue(payload);

    const result = await controller.getProfile({ user: { employeeId: "5" } });

    expect(result).toBe(payload);
    expect(service.getProfile).toHaveBeenCalledWith("5");
  });

  it("is guarded, filtered, mounted at profile and requires PERFIL_PROPIO_CONSULTAR", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ProfileController)).toContain(AuthenticationGuard);
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, ProfileController)).toContain(
      DomainExceptionFilter,
    );
    expect(Reflect.getMetadata("path", ProfileController)).toBe("profile");
    const handler = (ProfileController.prototype as unknown as Record<string, () => void>)[
      "getProfile"
    ]!;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(["PERFIL_PROPIO_CONSULTAR"]);
  });
});
