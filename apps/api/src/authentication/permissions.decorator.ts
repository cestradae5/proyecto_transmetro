// Decorador @Permissions — declara permisos requeridos por endpoint.
// Se usa junto con AuthenticationGuard para control de acceso basado en permisos.
// Aplicación: @Permissions("administration.read") en métodos del controller.

import { SetMetadata } from "@nestjs/common";

export const PERMISSIONS_KEY = "permissions";

export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
