export type AuditResult = "EXITOSO" | "FALLIDO" | "ERROR";

export interface AuditLogEntry {
  id: string;
  createdAt: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  result: AuditResult;
  detalle: Record<string, unknown> | null;
  employee: { id: string; name: string; email: string };
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogOptions {
  modules: string[];
  actions: string[];
}

/** Every value is a raw form value; empty strings mean "no filter". */
export interface AuditLogFilters {
  from?: string;
  to?: string;
  user?: string;
  module?: string;
  action?: string;
  result?: "" | AuditResult;
}
