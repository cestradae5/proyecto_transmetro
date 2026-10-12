import { Controller, Get, Query, Req, Res, StreamableFile, UnauthorizedException, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { Permissions } from "../authentication/permissions.decorator.js";
import type { AuditActor } from "../fleet/shared/fleet.contracts.js";
import { DomainExceptionFilter } from "../shared/errors/domain-exception.filter.js";
import { AuditSummaryReportQueryDto } from "./dto/audit-summary-report-query.dto.js";
import type { DateRange, ReportType } from "./reports.contracts.js";
import { ReportsService } from "./reports.service.js";

// Permission literals match the DB seed values (database/init.sql, tbl_permiso).
const REPORTES_ADMINISTRATIVOS_CONSULTAR = "REPORTES_ADMINISTRATIVOS_CONSULTAR";
const AUDITORIA_BITACORA_CONSULTAR = "AUDITORIA_BITACORA_CONSULTAR";

// Administrative reports, each downloaded as a PDF attachment. Read-only over
// the data; every successful download is recorded in the audit log.
@ApiTags("Reportes")
@Controller("reports")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
@ApiProduces("application/pdf")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("fleet")
  @Permissions(REPORTES_ADMINISTRATIVOS_CONSULTAR)
  @ApiOperation({ summary: "PDF: units by state with their assigned line and pilot" })
  @ApiResponse({ status: 200, description: "PDF file" })
  @ApiResponse({ status: 403, description: "Missing REPORTES_ADMINISTRATIVOS_CONSULTAR permission" })
  fleet(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.send("fleet", request, response);
  }

  @Get("personnel")
  @Permissions(REPORTES_ADMINISTRATIVOS_CONSULTAR)
  @ApiOperation({ summary: "PDF: employees by role and state" })
  @ApiResponse({ status: 200, description: "PDF file" })
  @ApiResponse({ status: 403, description: "Missing REPORTES_ADMINISTRATIVOS_CONSULTAR permission" })
  personnel(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.send("personnel", request, response);
  }

  @Get("infrastructure")
  @Permissions(REPORTES_ADMINISTRATIVOS_CONSULTAR)
  @ApiOperation({ summary: "PDF: lines with their municipalities, stops and stations" })
  @ApiResponse({ status: 200, description: "PDF file" })
  @ApiResponse({ status: 403, description: "Missing REPORTES_ADMINISTRATIVOS_CONSULTAR permission" })
  infrastructure(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    return this.send("infrastructure", request, response);
  }

  @Get("audit-log")
  @Permissions(AUDITORIA_BITACORA_CONSULTAR)
  @ApiOperation({ summary: "PDF: audit log actions per module and per user within a date range" })
  @ApiResponse({ status: 200, description: "PDF file" })
  @ApiResponse({ status: 400, description: "Missing or invalid date range" })
  @ApiResponse({ status: 403, description: "Missing AUDITORIA_BITACORA_CONSULTAR permission" })
  auditLog(
    @Query() query: AuditSummaryReportQueryDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.send("audit-log", request, response, { from: query.from, to: query.to });
  }

  private async send(
    type: ReportType,
    request: Request,
    response: Response,
    range?: DateRange,
  ): Promise<StreamableFile> {
    const actor = this.actorOf(request);
    const report = range
      ? await this.reportsService.export(type, actor, range)
      : await this.reportsService.export(type, actor);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${report.fileName}"`);
    return new StreamableFile(report.content);
  }

  private actorOf(request: Request): AuditActor {
    const employeeId = request.user?.employeeId;
    if (!employeeId) {
      // AuthenticationGuard always sets request.user; this only guards misuse.
      throw new UnauthorizedException();
    }
    return { employeeId };
  }
}
