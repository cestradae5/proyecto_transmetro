import type { AuditResult } from "../types/audit-log.types";

// Values written by the API (module constants in apps/api). Unknown modules
// fall back to the raw value so new writers never disappear from the view.
const MODULE_LABELS: Record<string, string> = {
  authentication: "Autenticación",
  fleet: "Flota",
  personal: "Personal",
  infrastructure: "Infraestructura",
  operations: "Operaciones",
};

export const RESULT_LABELS: Record<AuditResult, string> = {
  EXITOSO: "Exitoso",
  FALLIDO: "Fallido",
  ERROR: "Error",
};

export const RESULT_STYLES: Record<AuditResult, string> = {
  EXITOSO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FALLIDO: "bg-amber-50 text-amber-700 border-amber-200",
  ERROR: "bg-red-50 text-red-700 border-red-200",
};

/** Shown for rows with no employee (a failed login attempt). */
export const SYSTEM_ACTOR_LABEL = "Sistema";
export const SYSTEM_ACTOR_HINT = "Intento de inicio de sesión";

/** "jwt #7", or just "jwt" when the row has no entity id. */
export function entityLabel(entityType: string, entityId: string | null): string {
  return entityId === null ? entityType : `${entityType} #${entityId}`;
}

export function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

export function formatAuditDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-GT");
}
