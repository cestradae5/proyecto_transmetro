import type { User } from '../authentication/auth-context';

export const FLEET_MANAGE_PERMISSION = 'FLOTA_GESTIONAR';
/** Lets a pilot report the location of their assigned unit. */
export const FLEET_REPORT_LOCATION_PERMISSION = 'METRICAS_UNIDAD_REPORTAR';

export function hasPermission(user: Pick<User, 'permissions'> | null | undefined, code: string): boolean {
  return Array.isArray(user?.permissions) && user.permissions.includes(code);
}
