import type { AuditLogEntry, AuditLogPage } from "../../features/audit-log/types/audit-log.types";

export const ENTRY: AuditLogEntry = {
  id: "10",
  createdAt: "2026-02-01T16:00:00.000Z",
  module: "fleet",
  action: "assign_pilot",
  entityType: "unidad",
  entityId: "7",
  result: "EXITOSO",
  detalle: { idUnidad: 7, idPiloto: 3 },
  employee: { id: "2", name: "Ana Pérez", email: "ana@transmetro.gt" },
};

export const LOGIN_FAILED: AuditLogEntry = {
  ...ENTRY,
  id: "11",
  module: "authentication",
  action: "LOGIN",
  entityType: "jwt",
  // A failed login is recorded with no entity and no employee (API sends null).
  entityId: null,
  result: "FALLIDO",
  detalle: null,
  employee: null,
};

export function page(items: AuditLogEntry[], overrides: Partial<AuditLogPage> = {}): AuditLogPage {
  return { items, total: items.length, page: 1, pageSize: 20, ...overrides };
}
