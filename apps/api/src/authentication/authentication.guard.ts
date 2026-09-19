// Guard de autenticación — protege rutas que requieren sesión válida.
// Extrae cookie __Host-transmetro_admin_session, valida vía AuthenticationService.me(),
// y adjunta el contexto de usuario al request.
// Combinable con @Permissions para control de acceso basado en permisos.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthenticationService } from "./authentication.service.js";
import { PERMISSIONS_KEY } from "./permissions.decorator.js";
import type { MeResult } from "./authentication.contracts.js";

// Extensión del request Express para adjuntar el contexto de usuario
declare module "express" {
  interface Request {
    user?: MeResult;
  }
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Extraer cookie de sesión del request
    const request = context.switchToHttp().getRequest();
    const cookie = request.headers.cookie as string | undefined;
    const sessionHash = this.extractSessionHash(cookie);

    if (!sessionHash) {
      throw new UnauthorizedException();
    }

    // 2. Validar sesión vía AuthenticationService.me()
    let user: MeResult;
    try {
      user = await this.authenticationService.me(sessionHash);
    } catch {
      throw new UnauthorizedException();
    }

    // 3. Adjuntar contexto de usuario al request
    request.user = user;

    // 4. Verificar permisos si @Permissions está presente
    const requiredPermissions = this.reflector.get<string[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every((permission) =>
        user.permissions.includes(permission),
      );

      if (!hasAllPermissions) {
        throw new ForbiddenException();
      }
    }

    return true;
  }

  // Extrae el hash de sesión de la cookie (HTTPS: __Host- prefix, HTTP: plain name)
  private extractSessionHash(cookie: string | undefined): string | undefined {
    if (!cookie) {
      return undefined;
    }
    // Match both __Host-transmetro_admin_session (HTTPS) and transmetro_admin_session (HTTP dev)
    const match = cookie.match(
      /(?:__Host-)?transmetro_admin_session=([a-f0-9]{64})/,
    );
    return match?.[1];
  }
}
