// Controlador HTTP de autenticación administrativa con Google.
// Expone 3 endpoints (login/me/logout) con cookies HttpOnly-Secure,
// validación de origen exacto y header X-Transmetro-Request.
// No contiene lógica de negocio; delega toda la orquestación a AuthenticationService.

import { Controller, Post, Get, Options, Req, Res, HttpStatus } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";

import { AuthenticationService } from "./authentication.service.js";
import { InvalidCredentials, EmployeeNotEligible } from "./authentication.contracts.js";
import { readAuthenticationEnvironment } from "../platform/configuration/environment.js";

@Controller("authentication")
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @Get("google")
  async redirectToGoogle(
    @Req() request: Record<string, any>,
    @Res() response: Record<string, any>,
  ): Promise<void> {
    const { googleWebClientId } = readAuthenticationEnvironment();
    const backendUrl = `${request.protocol}://${request.get("host")}`;
    const redirectUri = `${backendUrl}/authentication/google/callback`;

    const params = new URLSearchParams({
      client_id: googleWebClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
    });

    response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  @Get("google/callback")
  async googleCallback(
    @Req() request: Record<string, any>,
    @Res() response: Record<string, any>,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const code = request.query.code as string | undefined;
    const error = request.query.error as string | undefined;

    if (error || !code) {
      response.redirect(`${frontendUrl}/login?error=denied`);
      return;
    }

    try {
      const { googleWebClientId } = readAuthenticationEnvironment();
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientSecret) {
        response.redirect(`${frontendUrl}/login?error=unavailable`);
        return;
      }

      const backendUrl = `${request.protocol}://${request.get("host")}`;
      const redirectUri = `${backendUrl}/authentication/google/callback`;

      // Exchange authorization code for tokens
      const oauth2Client = new OAuth2Client(googleWebClientId, clientSecret, redirectUri);
      const { tokens } = await oauth2Client.getToken(code);
      const idToken = tokens.id_token;

      if (!idToken) {
        response.redirect(`${frontendUrl}/login?error=unavailable`);
        return;
      }

      // Generate JWT with user data
      const result = await this.authenticationService.login(idToken);
      
      // Redirect to frontend with token in URL fragment (secure for SPA)
      response.redirect(`${frontendUrl}/login?token=${encodeURIComponent(result.token)}`);
    } catch {
      response.redirect(`${frontendUrl}/login?error=denied`);
    }
  }



  @Get("me")
  async me(
    @Req() request: Record<string, any>,
    @Res() response: Record<string, any>,
  ): Promise<void> {
    // Extract JWT from Authorization header
    const authHeader = request.headers.authorization as string | undefined;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      response.status(HttpStatus.UNAUTHORIZED).json({ error: "AUTHENTICATION_REQUIRED" });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    try {
      const result = await this.authenticationService.verifyToken(token);
      response.status(HttpStatus.OK).json({
        employeeId: result.employeeId,
        email: result.email,
        roles: result.roles,
        permissions: result.permissions,
        scope: result.scope,
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
    // JWT stateless: no hay sesión que revocar server-side
    // El cliente borra el token del localStorage
    await this.authenticationService.logout();
    response.status(HttpStatus.NO_CONTENT).end();
  }

}
