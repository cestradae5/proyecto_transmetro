// Controlador HTTP de autenticación administrativa con Google.
// Expone 3 endpoints (login/me/logout) con cookies HttpOnly-Secure,
// validación de origen exacto y header X-Transmetro-Request.
// No contiene lógica de negocio; delega toda la orquestación a AuthenticationService.

import { Controller, Post, Get, Options, Req, Res, HttpStatus } from "@nestjs/common";

import { AuthenticationService } from "./authentication.service.js";
import { InvalidCredentials, EmployeeNotEligible } from "./authentication.contracts.js";
import { readAuthenticationEnvironment } from "../platform/configuration/environment.js";

// ============================================================================
// Cookie configuration contract — exposed for security testing
// ============================================================================

export const SESSION_COOKIE_FLAGS = "__Host-transmetro_admin_session=${sessionHash}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=43200";

export const SESSION_COOKIE_CLEAR_FLAGS = "__Host-transmetro_admin_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0";

@Controller("authentication")
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  // ---------------------------------------------------------------------------
  // Origen exacto de ADMIN_WEB_ORIGINS (una sola coincidencia, no wildcard)
  // Se lee perezosamente para permitir mocking en tests
  // ---------------------------------------------------------------------------
  private get adminWebOrigins(): string[] {
    return readAuthenticationEnvironment().adminWebOrigins;
  }

  @Options("google")
  async optionsGoogle(
    @Req() request: Record<string, any>,
    @Res() response: Record<string, any>,
  ): Promise<void> {
    const origin = request.headers.origin as string | undefined;

    if (!this.isOriginAllowed(origin)) {
      response.status(HttpStatus.FORBIDDEN).json({ error: "REQUEST_ORIGIN_DENIED" });
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Transmetro-Request");
    response.status(HttpStatus.NO_CONTENT).end();
  }

  @Post("google")
  async login(
    @Req() request: Record<string, any>,
    @Res() response: Record<string, any>,
  ): Promise<void> {
    const origin = request.headers.origin as string | undefined;
    const xTransmetroRequest = request.headers["x-transmetro-request"] as string | undefined;

    if (!this.isOriginAllowed(origin) || xTransmetroRequest !== "admin-web") {
      response.status(HttpStatus.FORBIDDEN).json({ error: "REQUEST_ORIGIN_DENIED" });
      return;
    }

    try {
      const credential = request.body.credential as string;
      const result = await this.authenticationService.login(credential);

      this.setSessionCookie(response, result.sessionHash);
      response.status(HttpStatus.OK).json({ sessionHash: result.sessionHash, expiresAt: result.expiresAt });
    } catch (error: unknown) {
      if (error instanceof InvalidCredentials || error instanceof EmployeeNotEligible) {
        response.status(HttpStatus.UNAUTHORIZED).json({ error: "AUTHENTICATION_DENIED" });
      } else {
        response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ error: "AUTHENTICATION_UNAVAILABLE" });
      }
    }
  }

  @Get("me")
  async me(
    @Req() request: Record<string, any>,
    @Res() response: Record<string, any>,
  ): Promise<void> {
    const origin = request.headers.origin as string | undefined;

    if (!this.isOriginAllowed(origin)) {
      response.status(HttpStatus.FORBIDDEN).json({ error: "REQUEST_ORIGIN_DENIED" });
      return;
    }

    const cookie = request.headers.cookie as string | undefined;
    const sessionHash = this.extractSessionHash(cookie);

    if (!sessionHash) {
      response.status(HttpStatus.UNAUTHORIZED).json({ error: "AUTHENTICATION_REQUIRED" });
      return;
    }

    try {
      const result = await this.authenticationService.me(sessionHash);
      response.status(HttpStatus.OK).json({
        employeeId: result.employeeId,
        email: result.email,
        roles: result.roles,
        permissions: result.permissions,
      });
    } catch {
      response.status(HttpStatus.UNAUTHORIZED).json({ error: "AUTHENTICATION_REQUIRED" });
    }
  }

  @Post("logout")
  async logout(
    @Req() request: Record<string, any>,
    @Res() response: Record<string, any>,
  ): Promise<void> {
    const origin = request.headers.origin as string | undefined;
    const xTransmetroRequest = request.headers["x-transmetro-request"] as string | undefined;

    if (!this.isOriginAllowed(origin) || xTransmetroRequest !== "admin-web") {
      return;
    }

    const cookie = request.headers.cookie as string | undefined;
    const sessionHash = this.extractSessionHash(cookie);

    try {
      await this.authenticationService.logout(sessionHash ?? "");
    } catch {
      // Logout es idempotente: si no existía sesión, igual responde 204
    }

    this.clearSessionCookie(response);
    response.status(HttpStatus.NO_CONTENT).end();
  }

  // ---------------------------------------------------------------------------
  // Origen exacto de ADMIN_WEB_ORIGINS (una sola coincidencia, no wildcard)
  // ---------------------------------------------------------------------------
  private isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) {
      return false;
    }
    return this.adminWebOrigins.some((allowed) => allowed === origin);
  }

  // ---------------------------------------------------------------------------
  // Cookie: __Host- prefix requiere Secure + Path=/ + HttpOnly
  // ---------------------------------------------------------------------------
  private setSessionCookie(response: Record<string, any>, sessionHash: string): void {
    response.setHeader(
      "Set-Cookie",
      SESSION_COOKIE_FLAGS.replace("${sessionHash}", sessionHash),
    );
  }

  private clearSessionCookie(response: Record<string, any>): void {
    response.setHeader(
      "Set-Cookie",
      SESSION_COOKIE_CLEAR_FLAGS,
    );
  }

  private extractSessionHash(cookie: string | undefined): string | undefined {
    if (!cookie) {
      return undefined;
    }
    const match = cookie.match(/__Host-transmetro_admin_session=([^;]+)/);
    return match?.[1];
  }
}
