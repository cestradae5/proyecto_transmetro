import {
  Body,
  Controller,
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
import {
  ALERTAS_ESTACION_GESTIONAR,
  ALERTAS_OPERATIVAS_GESTIONAR,
  ALERTAS_UNIDAD_GESTIONAR,
} from "./alerta.constants.js";
import { AlertaService } from "./alerta.service.js";
import type {
  AlertaDestinationsResponseDto,
  AlertaResponseDto,
  CentralAlertsResponseDto,
  StationAlertsResponseDto,
} from "./dto/alerta-response.dto.js";
import { CreateAlertaDto } from "./dto/create-alerta.dto.js";
import { UpdateAlertaStatusDto } from "./dto/update-alerta-status.dto.js";

// Static segments (my-unit/destinations, sent, my-station, central) never
// collide with ":id/status" (two segments) or "central/:id/status" (three).
@ApiTags("Operación - Alertas")
@Controller("operations/alerts")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class AlertaController {
  constructor(private readonly alertaService: AlertaService) {}

  @Get("my-unit/destinations")
  @Permissions(ALERTAS_UNIDAD_GESTIONAR)
  @ApiOperation({ summary: "Estaciones de la línea de mi unidad a las que puedo enviar alertas" })
  @ApiResponse({ status: 200, description: "Unidad, línea y estaciones (una sugerida)" })
  @ApiResponse({ status: 404, description: "Sin unidad asignada o unidad sin línea" })
  getDestinations(@Req() request: Record<string, any>): Promise<AlertaDestinationsResponseDto> {
    return this.alertaService.getDestinations(request.user.employeeId);
  }

  @Get("sent")
  @Permissions(ALERTAS_UNIDAD_GESTIONAR)
  @ApiOperation({ summary: "Alertas enviadas por el piloto (más recientes primero)" })
  listSent(@Req() request: Record<string, any>): Promise<AlertaResponseDto[]> {
    return this.alertaService.listSent(request.user.employeeId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions(ALERTAS_UNIDAD_GESTIONAR)
  @ApiOperation({ summary: "Enviar una alerta desde mi unidad a una estación de su línea" })
  @ApiResponse({ status: 201, description: "Alerta creada en estado PENDIENTE" })
  @ApiResponse({ status: 400, description: "Tipo inválido o estación fuera de la línea" })
  @ApiResponse({ status: 404, description: "Sin unidad asignada o unidad sin línea" })
  create(
    @Req() request: Record<string, any>,
    @Body() dto: CreateAlertaDto,
  ): Promise<AlertaResponseDto> {
    return this.alertaService.create(request.user.employeeId, dto);
  }

  @Get("my-station")
  @Permissions(ALERTAS_ESTACION_GESTIONAR)
  @ApiOperation({
    summary: "Alertas recibidas por la estación del operador, enviadas desde sus líneas activas",
  })
  @ApiQuery({
    name: "idLinea",
    required: false,
    description: "Solo las alertas de esta línea; una línea que no es de la estación devuelve una lista vacía",
  })
  @ApiResponse({ status: 404, description: "El operador no tiene una estación asignada" })
  getMyStation(
    @Req() request: Record<string, any>,
    @Query("idLinea") idLinea?: string,
  ): Promise<StationAlertsResponseDto> {
    return this.alertaService.getMyStation(request.user.employeeId, idLinea);
  }

  @Patch(":id/status")
  @Permissions(ALERTAS_ESTACION_GESTIONAR)
  @ApiOperation({ summary: "Avanzar el estado de una alerta de mi estación" })
  @ApiResponse({ status: 200, description: "Alerta actualizada" })
  @ApiResponse({
    status: 404,
    description: "Alerta inexistente, de otra estación o de una línea que la estación ya no atiende",
  })
  @ApiResponse({ status: 409, description: "Transición de estado no permitida" })
  updateStatus(
    @Req() request: Record<string, any>,
    @Param("id") id: string,
    @Body() dto: UpdateAlertaStatusDto,
  ): Promise<AlertaResponseDto> {
    return this.alertaService.updateStatus(request.user.employeeId, id, dto);
  }

  @Get("central")
  @Permissions(ALERTAS_OPERATIVAS_GESTIONAR)
  @ApiOperation({ summary: "Alertas de todas las estaciones agrupadas por línea, estación y unidad" })
  @ApiResponse({ status: 200, description: "Últimas 300 alertas unidad → estación agrupadas" })
  getCentral(): Promise<CentralAlertsResponseDto> {
    return this.alertaService.getCentral();
  }

  @Patch("central/:id/status")
  @Permissions(ALERTAS_OPERATIVAS_GESTIONAR)
  @ApiOperation({ summary: "Avanzar el estado de cualquier alerta (operación central)" })
  @ApiResponse({ status: 200, description: "Alerta actualizada" })
  @ApiResponse({ status: 404, description: "Alerta inexistente" })
  @ApiResponse({ status: 409, description: "Transición de estado no permitida" })
  updateCentralStatus(
    @Req() request: Record<string, any>,
    @Param("id") id: string,
    @Body() dto: UpdateAlertaStatusDto,
  ): Promise<AlertaResponseDto> {
    return this.alertaService.updateCentralStatus(request.user.employeeId, id, dto);
  }
}
