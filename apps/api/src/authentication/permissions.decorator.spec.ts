// ============================================================================
// TESTS RED — @Permissions decorator (task 2.3)
// Define el contrato del decorator que marca permisos requeridos por endpoint.
// ============================================================================

import { jest } from "@jest/globals";

describe("@Permissions decorator", () => {
  it("stores permission metadata on handler", async () => {
    const { Permissions, PERMISSIONS_KEY } = await import("./permissions.decorator.js");

    class TestController {
      @Permissions("administration.read")
      handle() {}
    }

    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, TestController.prototype.handle);

    expect(permissions).toEqual(["administration.read"]);
  });

  it("stores multiple permissions as array", async () => {
    const { Permissions, PERMISSIONS_KEY } = await import("./permissions.decorator.js");

    class TestController {
      @Permissions("administration.read", "administration.write")
      handle() {}
    }

    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, TestController.prototype.handle);

    expect(permissions).toEqual(["administration.read", "administration.write"]);
  });

  it("returns undefined when no permissions are set", async () => {
    const { PERMISSIONS_KEY } = await import("./permissions.decorator.js");

    class TestController {
      handle() {}
    }

    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, TestController.prototype.handle);

    expect(permissions).toBeUndefined();
  });
});
