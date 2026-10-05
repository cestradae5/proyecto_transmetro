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
  Query,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { AsignacionEstacionService } from "./asignacion-estacion.service.js";
import { AsignacionEstacionResponseDto } from "./dto/asignacion-estacion-response.dto.js";
import { CreateAsignacionEstacionDto } from "./dto/create-asignacion-estacion.dto.js";
import { UpdateAsignacionEstacionDto } from "./dto/update-asignacion-estacion.dto.js";

const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";

// "fleet/station-assignments" shares no path prefix with "fleet/units/:id",
// so route ordering in FleetModule is not a concern.
@ApiTags("Flota - Asignación de Operadores de Estación")
@Controller("fleet/station-assignments")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class AsignacionEstacionController {
  constructor(private readonly asignacionEstacionService: AsignacionEstacionService) {}

  @Get()
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Listar asignaciones ACTIVAS de operadores a estaciones" })
  @ApiQuery({ name: "idEstacion", required: false, description: "Filtrar por estación" })
  @ApiResponse({ status: 200, type: AsignacionEstacionResponseDto, isArray: true })
  list(@Query("idEstacion") idEstacion?: string): Promise<AsignacionEstacionResponseDto[]> {
    return this.asignacionEstacionService.list(idEstacion);
  }

  @Post()
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Asignar un operador a una estación" })
  @ApiResponse({ status: 201, description: "Operador asignado", type: AsignacionEstacionResponseDto })
  @ApiResponse({ status: 404, description: "Estación o empleado no encontrado" })
  @ApiResponse({
    status: 409,
    description: "El empleado no es un OPERADOR_ESTACION activo o ya tiene una estación asignada",
  })
  assign(
    @Body() dto: CreateAsignacionEstacionDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionEstacionResponseDto> {
    return this.asignacionEstacionService.assign(dto, request.user.employeeId);
  }

  @Patch(":id")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Reasignar un operador a otra estación" })
  @ApiResponse({ status: 200, description: "Asignación actualizada", type: AsignacionEstacionResponseDto })
  @ApiResponse({ status: 404, description: "Asignación activa o estación no encontrada" })
  reassign(
    @Param("id") id: string,
    @Body() dto: UpdateAsignacionEstacionDto,
    @Req() request: Record<string, any>,
  ): Promise<AsignacionEstacionResponseDto> {
    return this.asignacionEstacionService.reassign(id, dto, request.user.employeeId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Desasignar un operador (la asignación pasa a INACTIVA)" })
  @ApiResponse({ status: 204, description: "Asignación marcada como INACTIVA" })
  @ApiResponse({ status: 404, description: "Asignación activa no encontrada" })
  unassign(@Param("id") id: string, @Req() request: Record<string, any>): Promise<void> {
    return this.asignacionEstacionService.unassign(id, request.user.employeeId);
  }
}
