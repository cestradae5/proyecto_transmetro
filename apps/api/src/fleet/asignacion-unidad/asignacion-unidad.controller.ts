import {
  Body,
  Controller,
  Delete,
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
import { AsignacionUnidadService } from "./asignacion-unidad.service.js";
import { AsignacionUnidadResponseDto } from "./dto/asignacion-unidad-response.dto.js";
import { CorrectLocationDto } from "./dto/correct-location.dto.js";
import { CreateAsignacionUnidadDto } from "./dto/create-asignacion-unidad.dto.js";
import { ReportLocationDto } from "./dto/report-location.dto.js";
import { UpdateAsignacionUnidadDto } from "./dto/update-asignacion-unidad.dto.js";

// Permission literal matches the DB seed value (database/init.sql,
// tbl_permiso) exactly, following the bare-string convention already used
// by UnidadController/LineaController/ParqueoController ("FLOTA_GESTIONAR").
const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";

// Both /location routes on this controller require FLOTA_GESTIONAR — the
// pilot self-service POST /fleet/units/my-unit/location is a Slice 4 route
// on AsignacionPilotoController, not this one (design.md task 3.2.4).
@ApiTags("Flota - Asignación de Unidad")
@Controller("fleet/units")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class AsignacionUnidadController {
  constructor(private readonly asignacionUnidadService: AsignacionUnidadService) {}

  @Post(":unitId/line-assignment")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Asignar una línea a una unidad" })
  @ApiResponse({
    status: 201,
    description: "Línea asignada",
    type: AsignacionUnidadResponseDto,
  })
  @ApiResponse({ status: 404, description: "Unidad o línea no encontrada" })
  @ApiResponse({ status: 409, description: "La unidad ya tiene una línea asignada" })
  create(
    @Param("unitId") unitId: string,
    @Body() dto: CreateAsignacionUnidadDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.asignacionUnidadService.assign(unitId, dto, request.user.employeeId);
  }

  @Patch(":unitId/line-assignment")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Reasignar la línea de una unidad" })
  @ApiResponse({
    status: 200,
    description: "Línea reasignada",
    type: AsignacionUnidadResponseDto,
  })
  @ApiResponse({ status: 404, description: "Unidad sin asignación de línea, o línea no encontrada" })
  @ApiResponse({ status: 409, description: "La línea nueva es igual a la actual" })
  reassign(
    @Param("unitId") unitId: string,
    @Body() dto: UpdateAsignacionUnidadDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.asignacionUnidadService.reassign(unitId, dto, request.user.employeeId);
  }

  @Delete(":unitId/line-assignment")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Quitar la asignación de línea de una unidad" })
  @ApiResponse({ status: 204, description: "Asignación de línea eliminada" })
  @ApiResponse({ status: 404, description: "Unidad sin asignación de línea" })
  @ApiResponse({ status: 409, description: "La unidad está EN_SERVICIO" })
  unassign(
    @Param("unitId") unitId: string,
    @Req() request: Record<string, any>,
  ): Promise<void> {
    return this.asignacionUnidadService.unassign(unitId, request.user.employeeId);
  }

  @Post(":unitId/location")
  // Nest defaults @Post to 201, but this route reports the current location
  // rather than creating a resource, so 200 is the correct status (and what
  // the @ApiResponse below and the e2e spec both declare).
  @HttpCode(HttpStatus.OK)
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Reportar la ubicación actual de una unidad" })
  @ApiResponse({
    status: 200,
    description: "Ubicación reportada",
    type: AsignacionUnidadResponseDto,
  })
  @ApiResponse({ status: 404, description: "Unidad sin asignación de línea, o parada no encontrada" })
  @ApiResponse({ status: 409, description: "La parada no pertenece a la línea asignada" })
  reportLocation(
    @Param("unitId") unitId: string,
    @Body() dto: ReportLocationDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.asignacionUnidadService.reportLocation(unitId, dto, request.user.employeeId);
  }

  @Patch(":unitId/location")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Corregir la ubicación reportada de una unidad" })
  @ApiResponse({
    status: 200,
    description: "Ubicación corregida",
    type: AsignacionUnidadResponseDto,
  })
  @ApiResponse({ status: 404, description: "Unidad sin asignación de línea, o parada no encontrada" })
  @ApiResponse({ status: 409, description: "La parada no pertenece a la línea asignada" })
  correctLocation(
    @Param("unitId") unitId: string,
    @Body() dto: CorrectLocationDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionUnidadResponseDto> {
    return this.asignacionUnidadService.correctLocation(unitId, dto, request.user.employeeId);
  }
}
