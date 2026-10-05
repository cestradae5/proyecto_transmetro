// Constantes compartidas del módulo fleet (design.md Decision 4).
// FLEET_AUDIT_ACTIONS cubre las 11 mutaciones auditables definidas en el
// diseño; ROLE_CODES.PILOTO es el código de rol usado para validar pilotos.

export const FLEET_MODULE = "fleet";

export const FLEET_AUDIT_ACTIONS = {
  ASSIGN_LINE: "assign_line",
  ASSIGN_PILOT: "assign_pilot",
  CORRECT_LOCATION: "correct_location",
  CREATE: "create",
  REASSIGN_LINE: "reassign_line",
  REASSIGN_PILOT: "reassign_pilot",
  REASSIGN_STATION: "reassign_station",
  REMOVE: "remove",
  REPORT_LOCATION: "report_location",
  ASSIGN_STATION: "assign_station",
  UNASSIGN_LINE: "unassign_line",
  UNASSIGN_PILOT: "unassign_pilot",
  UNASSIGN_STATION: "unassign_station",
  UPDATE: "update",
} as const;

export type FleetAuditAction =
  (typeof FLEET_AUDIT_ACTIONS)[keyof typeof FLEET_AUDIT_ACTIONS];

export const ROLE_CODES = {
  PILOTO: "PILOTO",
  OPERADOR_ESTACION: "OPERADOR_ESTACION",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];
