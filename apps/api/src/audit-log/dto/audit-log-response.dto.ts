import type { AuditResult } from "../../authentication/entities/audit-log.entity.js";

export interface AuditLogEmployeeDto {
  id: string;
  name: string;
  email: string;
}

export interface AuditLogItemDto {
  id: string;
  createdAt: string;
  module: string;
  action: string;
  entityType: string;
  // Null for a failed login: the attempt is recorded with no entity and no
  // employee (the UI shows it as "Sistema").
  entityId: string | null;
  result: AuditResult;
  detalle: Record<string, unknown> | null;
  employee: AuditLogEmployeeDto | null;
}

export interface AuditLogPageDto {
  items: AuditLogItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogOptionsDto {
  modules: string[];
  actions: string[];
}
