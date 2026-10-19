import type { User } from "../authentication/auth-context";
import { hasPermission } from "../fleet/permissions";

/** Fleet, personnel and infrastructure reports. */
export const REPORTS_ADMIN_PERMISSION = "REPORTES_ADMINISTRATIVOS_CONSULTAR";
/** Audit log viewer and the audit summary report. */
export const AUDIT_LOG_PERMISSION = "AUDITORIA_BITACORA_CONSULTAR";
/** Platform payments report. */
export const RECHARGE_REPORTS_PERMISSION = "RECARGAS_REPORTES_CONSULTAR";

type MaybeUser = Pick<User, "permissions"> | null | undefined;

export function canViewAuditLog(user: MaybeUser): boolean {
  return hasPermission(user, AUDIT_LOG_PERMISSION);
}

export function canViewAdministrativeReports(user: MaybeUser): boolean {
  return hasPermission(user, REPORTS_ADMIN_PERMISSION);
}

export function canViewPaymentsReport(user: MaybeUser): boolean {
  return hasPermission(user, RECHARGE_REPORTS_PERMISSION);
}

/** The administrative reports page has at least one report this user may download. */
export function canOpenReportsPage(user: MaybeUser): boolean {
  return canViewAdministrativeReports(user) || canViewAuditLog(user);
}
