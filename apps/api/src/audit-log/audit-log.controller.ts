import { Controller, Get, Query, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { Permissions } from "../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../shared/errors/domain-exception.filter.js";
import { AuditLogService } from "./audit-log.service.js";
import type { AuditLogOptionsDto, AuditLogPageDto } from "./dto/audit-log-response.dto.js";
import { QueryAuditLogDto } from "./dto/query-audit-log.dto.js";

// Permission literal matches the DB seed value (database/init.sql, tbl_permiso).
const AUDITORIA_BITACORA_CONSULTAR = "AUDITORIA_BITACORA_CONSULTAR";

// Read-only by design (REQ-FUNC-012): the audit log exposes no mutation routes.
@ApiTags("Bitácora")
@Controller("audit-log")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Permissions(AUDITORIA_BITACORA_CONSULTAR)
  @ApiOperation({ summary: "List audit log entries, newest first, with optional filters and pagination" })
  @ApiResponse({ status: 200, description: "Page of audit log entries" })
  @ApiResponse({ status: 400, description: "Invalid query parameters" })
  @ApiResponse({ status: 403, description: "Missing AUDITORIA_BITACORA_CONSULTAR permission" })
  findAll(@Query() query: QueryAuditLogDto): Promise<AuditLogPageDto> {
    return this.auditLogService.findAll(query);
  }

  @Get("options")
  @Permissions(AUDITORIA_BITACORA_CONSULTAR)
  @ApiOperation({ summary: "Distinct modules and actions present in the audit log, for filters" })
  @ApiResponse({ status: 200, description: "Filter options" })
  @ApiResponse({ status: 403, description: "Missing AUDITORIA_BITACORA_CONSULTAR permission" })
  getOptions(): Promise<AuditLogOptionsDto> {
    return this.auditLogService.getOptions();
  }
}
