// ============================================================================
// TESTS RED — AuthenticationGuard + @Permissions (task 2.3)
// Estos tests definen el contrato del guard ANTES de implementarlo.
// Cada test falla (RED) hasta que el guard implemente la regla correspondiente.
// ============================================================================

import { jest } from "@jest/globals";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticationService } from "./authentication.service.js";
import type { MeResult } from "./authentication.contracts.js";

// Cookie name del host — la cookie se llama exactamente así en el browser
const SESSION_COOKIE = "__Host-transmetro_admin_session";

// Mock types
type MockAuthenticationService = {
  me: jest.MockedFunction<(hash: string) => Promise<MeResult>>;
};

// Helper para crear un MeResult con scope completo
function makeMeResult(overrides: Record<string, any> = {}): MeResult {
  return {
    employeeId: "emp-1",
    email: "admin@transmetro.gt",
    roles: ["ADMIN"],
    permissions: ["administration.read", "administration.write"],
    scope: { role: "ADMIN", modules: ["dashboard", "passengers", "drivers", "routes", "trips", "billing", "reports", "audit"] },
    ...overrides,
  };
}

function makeMockContext(cookies: Record<string, string> = {}): ExecutionContext {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { cookie: cookieHeader || undefined },
        user: undefined,
      }),
      getResponse: () => ({}),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe("AuthenticationGuard", () => {
  // --------------------------------------------------------------------------
  // Guard sin @Permissions — solo requiere sesión válida
  // --------------------------------------------------------------------------
  describe("without @Permissions decorator", () => {
    it("allows access when session cookie is valid", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn().mockResolvedValue(makeMeResult()),
      };

      const guard = new AuthenticationGuard(mockService as any, new Reflector());
      const context = makeMockContext({
        [SESSION_COOKIE]: "a".repeat(64),
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockService.me).toHaveBeenCalledWith("a".repeat(64));
    });

    it("rejects access when no session cookie is present", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn(),
      };

      const guard = new AuthenticationGuard(mockService as any, new Reflector());
      const context = makeMockContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(mockService.me).not.toHaveBeenCalled();
    });

    it("rejects access when session is expired", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn().mockRejectedValue(new Error("Session expired")),
      };

      const guard = new AuthenticationGuard(mockService as any, new Reflector());
      const context = makeMockContext({
        [SESSION_COOKIE]: "b".repeat(64),
      });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it("attaches user context to request on success", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn().mockResolvedValue(makeMeResult()),
      };

      const guard = new AuthenticationGuard(mockService as any, new Reflector());
      const request = { headers: { cookie: `${SESSION_COOKIE}=${"a".repeat(64)}` }, user: undefined };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => ({}),
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect(request.user).toEqual(makeMeResult());
    });
  });

  // --------------------------------------------------------------------------
  // Guard con @Permissions — requiere sesión + permisos específicos
  // --------------------------------------------------------------------------
  describe("with @Permissions decorator", () => {
    it("allows access when user has required permission", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const { PERMISSIONS_KEY } = await import("./permissions.decorator.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn().mockResolvedValue(makeMeResult()),
      };

      // Simula un handler decorado con @Permissions("administration.read")
      const handler = () => {};
      Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.read"], handler);

      const reflector = new Reflector();
      const guard = new AuthenticationGuard(mockService as any, reflector);
      const context = makeMockContext({
        [SESSION_COOKIE]: "a".repeat(64),
      });
      context.getHandler = jest.fn().mockReturnValue(handler);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it("rejects access when user lacks required permission", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const { PERMISSIONS_KEY } = await import("./permissions.decorator.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn().mockResolvedValue(makeMeResult({
          employeeId: "emp-2",
          email: "operator@transmetro.gt",
          roles: ["OPERATOR"],
          permissions: ["operations.read"],
          scope: { role: "OPERATOR", modules: ["passengers", "routes", "trips"] },
        })),
      };

      const handler = () => {};
      Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.write"], handler);

      const reflector = new Reflector();
      const guard = new AuthenticationGuard(mockService as any, reflector);
      const context = makeMockContext({
        [SESSION_COOKIE]: "c".repeat(64),
      });
      context.getHandler = jest.fn().mockReturnValue(handler);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("rejects when session is invalid even if @Permissions is set", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const { PERMISSIONS_KEY } = await import("./permissions.decorator.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn().mockRejectedValue(new Error("Invalid session")),
      };

      const handler = () => {};
      Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.read"], handler);

      const reflector = new Reflector();
      const guard = new AuthenticationGuard(mockService as any, reflector);
      const context = makeMockContext({}); // no cookie
      context.getHandler = jest.fn().mockReturnValue(handler);

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  // --------------------------------------------------------------------------
  // Cookie name contract — __Host- prefix
  // --------------------------------------------------------------------------
  describe("cookie extraction", () => {
    it("extracts session hash from __Host-transmetro_admin_session cookie", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn().mockResolvedValue(makeMeResult()),
      };

      const guard = new AuthenticationGuard(mockService as any, new Reflector());
      const context = makeMockContext({
        [SESSION_COOKIE]: "d".repeat(64),
      });

      await guard.canActivate(context);

      expect(mockService.me).toHaveBeenCalledWith("d".repeat(64));
    });

    it("ignores other cookies and extracts only the session cookie", async () => {
      const { AuthenticationGuard } = await import("./authentication.guard.js");
      const mockService: MockAuthenticationService = {
        me: jest.fn().mockResolvedValue(makeMeResult()),
      };

      const guard = new AuthenticationGuard(mockService as any, new Reflector());
      const context = makeMockContext({
        other_cookie: "some-value",
        [SESSION_COOKIE]: "e".repeat(64),
      });

      await guard.canActivate(context);

      expect(mockService.me).toHaveBeenCalledWith("e".repeat(64));
    });
  });
});
