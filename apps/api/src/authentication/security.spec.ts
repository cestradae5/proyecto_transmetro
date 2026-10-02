// ============================================================================
// Security contracts that production actually implements.
//
// Deliberately NOT covered here (unimplemented scope, documented in
// odd/tasks/fix-api-test-failures.md, not skipped-and-forgotten):
//   - Session cookie flags (`__Host-transmetro_admin_session`, HttpOnly/Secure/
//     SameSite/Max-Age). The controller sets no cookie at all and
//     `SESSION_COOKIE_FLAGS_SECURE` / `SESSION_COOKIE_FLAGS_INSECURE` are not
//     exported anywhere in the repo.
//   - HTTP Origin enforcement and the `X-Transmetro-Request: admin-web` header.
//     The controller implements neither; there is no `isOriginAllowed`.
//   - CORS response headers / preflight handling. No CORS middleware is wired.
// What remains below is the origin *configuration* contract (parsing and
// validation of ADMIN_WEB_ORIGINS) and the guard's permission denial.
// ============================================================================

import "reflect-metadata";
import { jest } from "@jest/globals";
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticationGuard } from "./authentication.guard.js";
import { PERMISSIONS_KEY } from "./permissions.decorator.js";
import { AuthenticationService } from "./authentication.service.js";
import type { MeResult } from "./authentication.contracts.js";

// ============================================================================
// 1. ADMIN_WEB_ORIGINS — exact http/https origins, no wildcards
// ============================================================================

describe("Admin web origin configuration", () => {
  it("allows only exact ADMIN_WEB_ORIGINS, no wildcard matching", async () => {
    const { readAuthenticationEnvironment } = await import(
      "../platform/configuration/environment.js"
    );

    const env = readAuthenticationEnvironment({
      ADMIN_WEB_ORIGINS: "https://admin.transmetro.gt",
      GOOGLE_WEB_CLIENT_ID: "client-id",
    });

    expect(env.adminWebOrigins).toEqual(["https://admin.transmetro.gt"]);
    expect(env.adminWebOrigins).not.toContain("*");
  });

  it("rejects wildcard origins in configuration", async () => {
    const { readAuthenticationEnvironment } = await import(
      "../platform/configuration/environment.js"
    );

    expect(() => {
      readAuthenticationEnvironment({
        ADMIN_WEB_ORIGINS: "*",
        GOOGLE_WEB_CLIENT_ID: "client-id",
      });
    }).toThrow();
  });

  it("rejects protocol-relative origins (//)", async () => {
    const { readAuthenticationEnvironment } = await import(
      "../platform/configuration/environment.js"
    );

    expect(() => {
      readAuthenticationEnvironment({
        ADMIN_WEB_ORIGINS: "//evil.com",
        GOOGLE_WEB_CLIENT_ID: "client-id",
      });
    }).toThrow();
  });

  it("rejects non-HTTP/HTTPS origins", async () => {
    const { readAuthenticationEnvironment } = await import(
      "../platform/configuration/environment.js"
    );

    expect(() => {
      readAuthenticationEnvironment({
        ADMIN_WEB_ORIGINS: "ftp://admin.transmetro.gt",
        GOOGLE_WEB_CLIENT_ID: "client-id",
      });
    }).toThrow();
  });
});

// ============================================================================
// 2. PERMISSION DENIAL — Guard rechaza sin permisos válidos
// ============================================================================

describe("Permission denial via AuthenticationGuard", () => {
  function makeContextFor(handler: () => void): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: "Bearer valid.jwt.token" },
          user: undefined,
        }),
        getResponse: () => ({}),
      }),
      getHandler: () => handler,
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  }

  function makeUser(overrides: Partial<MeResult> = {}): MeResult {
    return {
      employeeId: "emp-2",
      email: "operator@transmetro.gt",
      roles: ["OPERATOR"],
      permissions: ["operations.read"],
      scope: { role: "OPERATOR", modules: ["fleet", "operational_alerts"] },
      ...overrides,
    };
  }

  it("rejects access when user lacks required permission", async () => {
    const mockService = { verifyToken: jest.fn().mockResolvedValue(makeUser()) };

    const handler = () => {};
    Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.write"], handler);

    const guard = new AuthenticationGuard(
      mockService as unknown as AuthenticationService,
      new Reflector(),
    );

    await expect(guard.canActivate(makeContextFor(handler))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("throws ForbiddenException for missing permissions even with valid token", async () => {
    const mockService = {
      verifyToken: jest.fn().mockResolvedValue(
        makeUser({
          employeeId: "emp-1",
          email: "admin@transmetro.gt",
          roles: ["ADMIN"],
          permissions: ["administration.read"],
          scope: { role: "ADMIN", modules: ["infrastructure"] },
        }),
      ),
    };

    const handler = () => {};
    Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.write"], handler);

    const guard = new AuthenticationGuard(
      mockService as unknown as AuthenticationService,
      new Reflector(),
    );

    await expect(guard.canActivate(makeContextFor(handler))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("rejects access when @Permissions is set but user has no permissions at all", async () => {
    const mockService = {
      verifyToken: jest.fn().mockResolvedValue(
        makeUser({
          employeeId: "emp-3",
          email: "guest@transmetro.gt",
          roles: ["GUEST"],
          permissions: [],
          scope: { role: "GUEST", modules: [] },
        }),
      ),
    };

    const handler = () => {};
    Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.read"], handler);

    const guard = new AuthenticationGuard(
      mockService as unknown as AuthenticationService,
      new Reflector(),
    );

    await expect(guard.canActivate(makeContextFor(handler))).rejects.toThrow(
      ForbiddenException,
    );
  });
});