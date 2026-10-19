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

// Same codes and order as apps/api/src/operations/alerts/alerta.constants.ts.
export const ALERT_TYPE_ORDER = [
  "ACCIDENTE",
  "FALLA_MECANICA",
  "EMERGENCIA_MEDICA",
  "INCIDENTE_SEGURIDAD",
  "RETRASO",
  "UNIDAD_LLENA",
] as const;

export const ALERT_TYPE_LABELS: Record<string, string> = {
  ACCIDENTE: "Accidente",
  FALLA_MECANICA: "Falla mecánica",
  EMERGENCIA_MEDICA: "Emergencia médica",
  INCIDENTE_SEGURIDAD: "Incidente de seguridad",
  RETRASO: "Retraso",
  UNIDAD_LLENA: "Unidad llena",
};

export const ALERT_STATE_ORDER = ["PENDIENTE", "RECIBIDA", "EN_ATENCION", "RESUELTA"] as const;

export const ALERT_STATE_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  RECIBIDA: "Recibida",
  EN_ATENCION: "En atención",
  RESUELTA: "Resuelta",
};

// Same codes as tbl_transaccion_pago.estado_pago (database/init.sql).
export const PAYMENT_STATE_ORDER = [
  "INICIADA",
  "PENDIENTE_AUTENTICACION",
  "APROBADA",
  "RECHAZADA",
  "ERROR",
  "EXPIRADA",
] as const;

export const PAYMENT_STATE_LABELS: Record<string, string> = {
  INICIADA: "Iniciada",
  PENDIENTE_AUTENTICACION: "Pendiente de autenticación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  ERROR: "Error",
  EXPIRADA: "Expirada",
};

/** Falls back to the raw value so an unknown state is still printed. */
export function label(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value;
}
