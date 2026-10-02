// Shared constants for the personal (employee administration) module.
// Values must fit the tbl_bitacora varchar limits (module 60, action 80, entity type 60).

export const PERSONAL_MODULE = "personal";

export const PERSONAL_AUDIT_ACTIONS = {
  CREATE: "create",
  UPDATE: "update",
  REMOVE: "remove",
} as const;

export type PersonalAuditAction =
  (typeof PERSONAL_AUDIT_ACTIONS)[keyof typeof PERSONAL_AUDIT_ACTIONS];

export const PERSONAL_ENTITY_TYPE = "empleado";
