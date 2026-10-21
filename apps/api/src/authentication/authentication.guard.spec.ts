// ============================================================================
// AuthenticationGuard contract.
//
// The guard is the real one: it reads `Authorization: Bearer <token>`, calls
// `authenticationService.verifyToken(token)`, attaches the resulting MeResult to
// `request.user`, and then — only if the handler carries @Permissions — requires
// the user's permissions to cover every required one, throwing ForbiddenException
// otherwise. There is no cookie parsing and no `me()`.
// ============================================================================

import { jest } from "@jest/globals";
import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthenticationGuard } from "./authentication.guard.js";
import { PERMISSIONS_KEY } from "./permissions.decorator.js";
import { AuthenticationService } from "./authentication.service.js";
import type { MeResult } from "./authentication.contracts.js";

// Mock types
type MockAuthenticationService = {
  verifyToken: jest.MockedFunction<(token: string) => Promise<MeResult>>;
};

// Helper para crear un MeResult con scope completo.
// Module vocabulary matches the 6 role-based modules + self_profile from
// PERMISSION_TO_MODULE.
function makeMeResult(overrides: Partial<MeResult> = {}): MeResult {
  return {
    employeeId: "emp-1",
    email: "admin@transmetro.gt",
    roles: ["ADMIN"],
    permissions: ["administration.read", "administration.write"],
    scope: {
      role: "ADMIN",
      modules: [
        "infrastructure",
        "fleet",
        "personnel",
        "operational_alerts",
        "reports",
        "recharge_reporting",
        "self_profile",
      ],
    },
    ...overrides,
  };
}

function makeMockService(
  result: MeResult | Error = makeMeResult(),
): MockAuthenticationService {
  return {
    verifyToken: result instanceof Error
      ? jest.fn().mockRejectedValue(result)
      : jest.fn().mockResolvedValue(result),
  };
}

/**
 * Builds an ExecutionContext carrying a single `Authorization: Bearer <token>`
 * header. Passing no token produces a request with no Authorization header.
 */
function makeMockContext(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: token === undefined ? undefined : `Bearer ${token}` },
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
  // Guard sin @Permissions — solo requiere un token válido
  // --------------------------------------------------------------------------
  describe("without @Permissions decorator", () => {
    it("allows access when the bearer token is valid", async () => {
      const mockService = makeMockService();
      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );

      const result = await guard.canActivate(makeMockContext("valid.jwt.token"));

      expect(result).toBe(true);
      expect(mockService.verifyToken).toHaveBeenCalledWith("valid.jwt.token");
    });

    it("rejects access when no Authorization header is present", async () => {
      const mockService = makeMockService();
      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );

      await expect(guard.canActivate(makeMockContext())).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockService.verifyToken).not.toHaveBeenCalled();
    });

    it("rejects access when the token is expired or invalid", async () => {
      const mockService = makeMockService(new Error("jwt expired"));
      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );

      await expect(guard.canActivate(makeMockContext("expired.jwt.token"))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("attaches user context to request on success", async () => {
      const mockService = makeMockService();
      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );
      const request: { headers: Record<string, string>; user?: MeResult } = {
        headers: { authorization: "Bearer aaa.bbb.ccc" },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect(request.user).toEqual(makeMeResult());
    });
  });

  // --------------------------------------------------------------------------
  // Guard con @Permissions — requiere token válido + permisos específicos
  // --------------------------------------------------------------------------
  describe("with @Permissions decorator", () => {
    it("allows access when user has required permission", async () => {
      const mockService = makeMockService();

      // Simula un handler decorado con @Permissions("administration.read")
      const handler = () => {};
      Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.read"], handler);

      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );
      const context = makeMockContext("valid.jwt.token");
      context.getHandler = jest.fn().mockReturnValue(handler);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it("rejects access when user lacks required permission", async () => {
      const mockService = makeMockService(
        makeMeResult({
          employeeId: "emp-2",
          email: "operator@transmetro.gt",
          roles: ["OPERATOR"],
          permissions: ["operations.read"],
          scope: { role: "OPERATOR", modules: ["fleet", "operational_alerts"] },
        }),
      );

      const handler = () => {};
      Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.write"], handler);

      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );
      const context = makeMockContext("valid.jwt.token");
      context.getHandler = jest.fn().mockReturnValue(handler);

      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it("rejects when the token is invalid even if @Permissions is set", async () => {
      const mockService = makeMockService(new Error("invalid token"));

      const handler = () => {};
      Reflect.defineMetadata(PERMISSIONS_KEY, ["administration.read"], handler);

      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );
      const context = makeMockContext("tampered.jwt.token");
      context.getHandler = jest.fn().mockReturnValue(handler);

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      // The permission check must never be reached with an unverified token.
      expect(mockService.verifyToken).toHaveBeenCalledWith("tampered.jwt.token");
    });
  });

  // --------------------------------------------------------------------------
  // Authorization header contract — Bearer prefix, cookies are not read
  // --------------------------------------------------------------------------
  describe("Authorization header extraction", () => {
    it("extracts the token from the Authorization header, ignoring cookies", async () => {
      const mockService = makeMockService();
      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );
      const request = {
        headers: {
          // A stale session cookie must be irrelevant: the guard reads the header.
          cookie: "__Host-transmetro_admin_session=" + "a".repeat(64),
          authorization: "Bearer header.jwt.token",
        },
        user: undefined,
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      await guard.canActivate(context);

      expect(mockService.verifyToken).toHaveBeenCalledWith("header.jwt.token");
    });

    it("rejects a header that does not use the Bearer scheme", async () => {
      const mockService = makeMockService();
      const guard = new AuthenticationGuard(
        mockService as unknown as AuthenticationService,
        new Reflector(),
      );
      const request = {
        headers: { authorization: "Basic dXNlcjpwYXNz", cookie: "session=abc" },
        user: undefined,
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(mockService.verifyToken).not.toHaveBeenCalled();
    });
  });
});