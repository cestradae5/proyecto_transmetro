import type { User } from "../authentication/auth-context";
import { hasPermission } from "../fleet/permissions";

export const EMPLEADOS_PERFILES_ADMINISTRAR = "EMPLEADOS_PERFILES_ADMINISTRAR";

export function canManageEmpleados(
  user: Pick<User, "permissions"> | null | undefined,
): boolean {
  return hasPermission(user, EMPLEADOS_PERFILES_ADMINISTRAR);
}
