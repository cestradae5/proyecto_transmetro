// Spanish labels for the stored enum values printed in the reports.

export const UNIT_STATUS_ORDER = ["DISPONIBLE", "EN_SERVICIO", "MANTENIMIENTO", "FUERA_DE_SERVICIO"] as const;

export const UNIT_STATUS_LABELS: Record<string, string> = {
  DISPONIBLE: "Disponible",
  EN_SERVICIO: "En servicio",
  MANTENIMIENTO: "En mantenimiento",
  FUERA_DE_SERVICIO: "Fuera de servicio",
};

export const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  ACTIVO: "Activo",
  INACTIVO: "Inactivo",
};

export const LINE_STATUS_LABELS: Record<string, string> = { ACTIVA: "Activa", INACTIVA: "Inactiva" };

export const ROUTE_TYPE_LABELS: Record<string, string> = { CIRCULAR: "Circular", LINEAL: "Lineal" };

export const STOP_STATUS_LABELS: Record<string, string> = {
  ACTIVA: "Activa",
  CERRADA: "Cerrada",
  MANTENIMIENTO: "Mantenimiento",
};

export const AUDIT_RESULT_LABELS: Record<string, string> = {
  EXITOSO: "Exitoso",
  FALLIDO: "Fallido",
  ERROR: "Error",
};

/** Falls back to the raw value so an unknown state is still printed. */
export function label(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value;
}
