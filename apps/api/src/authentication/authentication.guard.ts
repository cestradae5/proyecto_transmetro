// Guard de autenticación JWT — protege rutas que requieren token válido.
// Extrae Authorization: Bearer <token>, valida vía AuthenticationService.verifyToken(),
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
    // 1. Extraer JWT del header Authorization
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException();
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    // 2. Validar JWT vía AuthenticationService.verifyToken()
    let user: MeResult;
    try {
      user = await this.authenticationService.verifyToken(token);
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
}
