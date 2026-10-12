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
  entityId: string;
  result: AuditResult;
  detalle: Record<string, unknown> | null;
  employee: AuditLogEmployeeDto;
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
