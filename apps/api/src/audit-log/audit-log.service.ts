import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import type { AuditResult } from "../authentication/entities/audit-log.entity.js";
import type { AuditLogItemDto, AuditLogOptionsDto, AuditLogPageDto } from "./dto/audit-log-response.dto.js";
import type { QueryAuditLogDto } from "./dto/query-audit-log.dto.js";

interface AuditLogRow {
  id: string;
  createdAt: Date | string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
  result: AuditResult;
  detalle: Record<string, unknown> | null;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const FROM_CLAUSE = "FROM tbl_bitacora b JOIN tbl_empleado e ON e.id_emple = b.id_empleado";

// Read-only view over tbl_bitacora. Every filter value is bound as a
// parameter; the log is never written from here. Stateless dataSource
// pattern, same as ProfileService.
@Injectable()
export class AuditLogService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: QueryAuditLogDto): Promise<AuditLogPageDto> {
    const { page, pageSize } = query;
    const { where, params } = buildWhere(query);

    const [{ total }] = (await this.dataSource.query(
      `SELECT COUNT(*) AS total ${FROM_CLAUSE}${where}`,
      params,
    )) as [{ total: string }];
    const count = Number(total);
    if (count === 0) {
      return { items: [], total: 0, page, pageSize };
    }

    const limitIndex = params.length + 1;
    const rows = (await this.dataSource.query(
      `SELECT b.id_bitacora AS "id",
              b.fecha_hora AS "createdAt",
              b.modulo AS "module",
              b.accion AS "action",
              b.entidad_tipo AS "entityType",
              b.entidad_id AS "entityId",
              b.resultado AS "result",
              b.detalle AS "detalle",
              e.id_emple AS "employeeId",
              e.nombre_emple AS "employeeName",
              e.correo_emple AS "employeeEmail"
         ${FROM_CLAUSE}${where}
        ORDER BY b.fecha_hora DESC, b.id_bitacora DESC
        LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`,
      [...params, pageSize, (page - 1) * pageSize],
    )) as AuditLogRow[];

    return { items: rows.map(toItem), total: count, page, pageSize };
  }

  async getOptions(): Promise<AuditLogOptionsDto> {
    const modules = (await this.dataSource.query(
      "SELECT DISTINCT modulo AS value FROM tbl_bitacora ORDER BY modulo",
    )) as Array<{ value: string }>;
    const actions = (await this.dataSource.query(
      "SELECT DISTINCT accion AS value FROM tbl_bitacora ORDER BY accion",
    )) as Array<{ value: string }>;
    return { modules: modules.map((r) => r.value), actions: actions.map((r) => r.value) };
  }
}

function buildWhere(query: QueryAuditLogDto): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (query.from) conditions.push(`b.fecha_hora >= ${bind(query.from)}`);
  if (query.to) {
    // A date-only upper bound covers the whole day: strictly before the next one.
    conditions.push(
      DATE_ONLY.test(query.to)
        ? `b.fecha_hora < ${bind(nextDay(query.to))}`
        : `b.fecha_hora <= ${bind(query.to)}`,
    );
  }
  if (query.user) {
    const placeholder = bind(`%${escapeLike(query.user)}%`);
    conditions.push(`(e.nombre_emple ILIKE ${placeholder} OR e.correo_emple ILIKE ${placeholder})`);
  }
  if (query.module) conditions.push(`b.modulo = ${bind(query.module)}`);
  if (query.action) conditions.push(`b.accion = ${bind(query.action)}`);
  if (query.result) conditions.push(`b.resultado = ${bind(query.result)}`);

  return { where: conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "", params };
}

function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString();
}

// Postgres LIKE uses backslash as the default escape character.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function toItem(row: AuditLogRow): AuditLogItemDto {
  return {
    id: String(row.id),
    createdAt: new Date(row.createdAt).toISOString(),
    module: row.module,
    action: row.action,
    entityType: row.entityType,
    entityId: String(row.entityId),
    result: row.result,
    detalle: row.detalle ?? null,
    employee: { id: String(row.employeeId), name: row.employeeName, email: row.employeeEmail },
  };
}
