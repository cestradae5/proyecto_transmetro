import type { User } from '../authentication/auth-context';

export const FLEET_MANAGE_PERMISSION = 'FLOTA_GESTIONAR';

export function hasPermission(user: Pick<User, 'permissions'> | null | undefined, code: string): boolean {
  return Array.isArray(user?.permissions) && user.permissions.includes(code);
}
