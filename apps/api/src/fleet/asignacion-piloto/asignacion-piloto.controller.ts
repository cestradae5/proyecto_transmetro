import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { AsignacionUnidadResponseDto } from "../asignacion-unidad/dto/asignacion-unidad-response.dto.js";
import { ReportLocationDto } from "../asignacion-unidad/dto/report-location.dto.js";
import { UnidadResponseDto } from "../unidad/dto/unidad-response.dto.js";
import { AsignacionPilotoService } from "./asignacion-piloto.service.js";
import { AsignacionPilotoResponseDto } from "./dto/asignacion-piloto-response.dto.js";
import { CreateAsignacionPilotoDto } from "./dto/create-asignacion-piloto.dto.js";
import { UpdateAsignacionPilotoDto } from "./dto/update-asignacion-piloto.dto.js";

// Permission literals match the DB seed values (database/init.sql,
// tbl_permiso) exactly, following the bare-string convention already used
// by UnidadController/AsignacionUnidadController.
const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";
const UNIDAD_ASIGNADA_CONSULTAR = "UNIDAD_ASIGNADA_CONSULTAR";
const METRICAS_UNIDAD_REPORTAR = "METRICAS_UNIDAD_REPORTAR";

// Route-collision hazard (design.md Decision 9): GET "my-unit" is a static
// segment competing with UnidadController's dynamic GET ":id" at the same
// path depth ("fleet/units/my-unit" vs "fleet/units/:id"). This controller
// MUST be registered BEFORE UnidadController in FleetModule.controllers, or
// Nest/Express routing would match UnidadController.findOne(id: "my-unit")
// first and return a 404 "unit 'my-unit' not found" instead of ever
// reaching getOwnUnit(). See asignacion-piloto.e2e-spec.ts's dedicated
// route-collision test for the regression guard against this specific
// hazard.
@ApiTags("Flota - Asignación de Piloto")
@Controller("fleet/units")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class AsignacionPilotoController {
  constructor(private readonly asignacionPilotoService: AsignacionPilotoService) {}

  @Post(":unitId/pilot-assignment")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Asignar un piloto a una unidad" })
  @ApiResponse({ status: 201, description: "Piloto asignado", type: AsignacionPilotoResponseDto })
  @ApiResponse({ status: 404, description: "Unidad o empleado no encontrado" })
  @ApiResponse({
    status: 409,
    description: "El empleado no es PILOTO, ya está asignado a otra unidad, o la unidad ya tiene piloto",
  })
  assign(
    @Param("unitId") unitId: string,
    @Body() dto: CreateAsignacionPilotoDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionPilotoResponseDto> {
    return this.asignacionPilotoService.assign(unitId, dto, request.user.employeeId);
  }

  // Reassigns (moves) the pilot named in the body from their current unit
  // to :unitId — see asignacion-piloto.service.ts's module comment for why
  // :unitId is the TARGET unit here, unlike AsignacionUnidadController's
  // reassign (which replaces the SAME unit's line).
  @Patch(":unitId/pilot-assignment")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Reasignar un piloto a una unidad distinta" })
  @ApiResponse({ status: 200, description: "Piloto reasignado", type: AsignacionPilotoResponseDto })
  @ApiResponse({ status: 404, description: "Unidad, empleado, o asignación del piloto no encontrada" })
  @ApiResponse({
    status: 409,
    description:
      "Reasignación inválida: sin cambio, unidad de origen EN_SERVICIO, o unidad destino ya ocupada",
  })
  reassign(
    @Param("unitId") unitId: string,
    @Body() dto: UpdateAsignacionPilotoDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionPilotoResponseDto> {
    return this.asignacionPilotoService.reassign(unitId, dto, request.user.employeeId);
  }

  @Delete(":unitId/pilot-assignment")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Quitar la asignación de piloto de una unidad" })
  @ApiResponse({ status: 204, description: "Asignación de piloto eliminada" })
  @ApiResponse({ status: 404, description: "Unidad sin asignación de piloto" })
  @ApiResponse({ status: 409, description: "La unidad está EN_SERVICIO" })
  unassign(@Param("unitId") unitId: string, @Req() request: Record<string, any>): Promise<void> {
    return this.asignacionPilotoService.unassign(unitId, request.user.employeeId);
  }

  // Decision 6: scope resolved from request.user.employeeId at query time —
  // takes no route param, so cross-pilot queries are structurally
  // impossible.
  @Get("my-unit")
  @Permissions(UNIDAD_ASIGNADA_CONSULTAR)
  @ApiOperation({ summary: "Consultar la unidad asignada al piloto autenticado" })
  @ApiResponse({ status: 200, description: "Unidad asignada", type: UnidadResponseDto })
  @ApiResponse({ status: 404, description: "El piloto no tiene una unidad asignada" })
  getOwnUnit(@Req() request: Record<string, any>): Promise<UnidadResponseDto> {
    return this.asignacionPilotoService.getOwnUnit(request.user.employeeId);
  }

  @Post("my-unit/location")
  // Reports the current location rather than creating a resource, matching
  // AsignacionUnidadController.reportLocation's 200 (not Nest's default 201
  // for @Post).
  @HttpCode(HttpStatus.OK)
  @Permissions(METRICAS_UNIDAD_REPORTAR)
  @ApiOperation({ summary: "Reportar la ubicación actual de la unidad propia del piloto" })
  @ApiResponse({
    status: 200,
    description: "Ubicación reportada",
    type: AsignacionUnidadResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "El piloto no tiene unidad asignada, o la parada no existe",
  })
  @ApiResponse({ status: 409, description: "La parada no pertenece a la línea asignada" })
  reportOwnLocation(
    @Body() dto: ReportLocationDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.asignacionPilotoService.reportOwnLocation(request.user.employeeId, dto);
  }
}
