// Shared audit constants for the Infrastructure module.
// Values must fit the tbl_bitacora varchar limits (module 60, action 80, entity type 60).
// The module value is English ("infrastructure") to match fleet/personal and the
// admin-web MODULE_LABELS map that renders it as "Infraestructura".

export const INFRASTRUCTURE_MODULE = "infrastructure";

export const INFRASTRUCTURE_AUDIT_ACTIONS = {
  CREATE: "create",
  UPDATE: "update",
  REMOVE: "remove",
  LINK: "link",
  UNLINK: "unlink",
  REORDER: "reorder",
  // Written by an afectación on its línea, parada or estación.
  ACTIVATE: "activate",
  DEACTIVATE: "deactivate",
} as const;

export type InfrastructureAuditAction =
  (typeof INFRASTRUCTURE_AUDIT_ACTIONS)[keyof typeof INFRASTRUCTURE_AUDIT_ACTIONS];

export const INFRASTRUCTURE_ENTITY_TYPES = {
  MUNICIPALIDAD: "municipalidad",
  LINEA_MUNICIPALIDAD: "linea_municipalidad",
  ACCESO: "acceso",
  PARQUEO: "parqueo",
  PARADA: "parada",
  ESTACION: "estacion",
  ESTACION_LINEA: "estacion_linea",
  LINEA: "linea",
  LINEA_PARADA: "linea_parada",
  AFECTACION: "afectacion",
} as const;

export type InfrastructureEntityType =
  (typeof INFRASTRUCTURE_ENTITY_TYPES)[keyof typeof INFRASTRUCTURE_ENTITY_TYPES];
