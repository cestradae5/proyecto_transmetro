import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { ALERTAS_OPERATIVAS_GESTIONAR } from "../alerts/alerta.constants.js";
import { METRICAS_UNIDAD_REPORTAR, UNIDAD_ASIGNADA_CONSULTAR } from "./ridership.constants.js";
import { RidershipService } from "./ridership.service.js";
import { TurnstileKeyGuard } from "./turnstile-key.guard.js";
import { StopReportRequestDto, TurnstilePassDto } from "./dto/ridership-request.dto.js";
import type {
  CapacityAlertDto,
  ParadaOccupancyDto,
  StopReportDto,
  TurnstilePassResponseDto,
  UnitOccupancyDto,
} from "./dto/ridership-response.dto.js";

// S4-S6: the turnstile device. No user login: TurnstileKeyGuard checks the
// simulator flag and X-Turnstile-Key. Kept apart from RidershipController so
// the JWT guard never applies here.
@ApiTags("Operación - Conteo de pasajeros")
@Controller("operations/ridership/turnstile")
@UseGuards(TurnstileKeyGuard)
@UseFilters(DomainExceptionFilter)
export class TurnstileController {
  constructor(private readonly ridershipService: RidershipService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiHeader({ name: "X-Turnstile-Key", required: true, description: "Clave del dispositivo" })
  @ApiOperation({ summary: "Registrar una pasada por la talanquera (entrada cobra el pasaje)" })
  @ApiResponse({ status: 201, description: "Evento registrado; puede generar la alerta de capacidad" })
  @ApiResponse({ status: 400, description: "Cuerpo inválido" })
  @ApiResponse({ status: 401, description: "Clave de talanquera inválida" })
  @ApiResponse({ status: 404, description: "Simulador apagado, tarjeta o estación inexistente" })
  @ApiResponse({ status: 409, description: "Tarjeta no activa o saldo insuficiente" })
  registerPass(@Body() dto: TurnstilePassDto): Promise<TurnstilePassResponseDto> {
    return this.ridershipService.registerPass(dto);
  }
}

// The bus (bus-passenger-report): the pilot reads its unit and reports, at
// its current stop, who got off and on; the unit always comes from the
// caller's assignment. Readings for central operation
// (ALERTAS_OPERATIVAS_GESTIONAR). "my-unit" never collides with
// "units/:id" (different first segment).
@ApiTags("Operación - Conteo de pasajeros")
@Controller("operations/ridership")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class RidershipController {
  constructor(private readonly ridershipService: RidershipService) {}

  @Get("my-unit")
  @Permissions(UNIDAD_ASIGNADA_CONSULTAR)
  @ApiOperation({ summary: "Pasajeros a bordo de mi unidad y su último reporte" })
  @ApiResponse({ status: 404, description: "El piloto no tiene unidad asignada" })
  getMyUnit(@Req() request: Record<string, any>): Promise<UnitOccupancyDto> {
    return this.ridershipService.getMyUnit(request.user.employeeId);
  }

  @Post("my-unit/stop-report")
  @HttpCode(HttpStatus.CREATED)
  @Permissions(METRICAS_UNIDAD_REPORTAR)
  @ApiOperation({ summary: "Registrar cuántos bajaron y subieron en la parada actual de mi unidad" })
  @ApiResponse({ status: 201, description: "Reporte registrado; incluye a bordo y minutos de espera extra" })
  @ApiResponse({ status: 400, description: "Cantidades inválidas" })
  @ApiResponse({ status: 404, description: "El piloto no tiene unidad asignada" })
  @ApiResponse({ status: 409, description: "Sin parada actual, bajan más de los que van a bordo o se supera la capacidad" })
  reportStop(@Req() request: Record<string, any>, @Body() dto: StopReportRequestDto): Promise<StopReportDto> {
    return this.ridershipService.reportStop(request.user.employeeId, dto);
  }

  @Get("stops/:id")
  @Permissions(ALERTAS_OPERATIVAS_GESTIONAR)
  @ApiOperation({ summary: "Personas esperando en la parada (o estación) y estado de la alerta de capacidad" })
  @ApiResponse({ status: 404, description: "Parada inexistente" })
  getStop(@Param("id") id: string): Promise<ParadaOccupancyDto> {
    return this.ridershipService.getParada(id);
  }

  @Get("units/:id")
  @Permissions(ALERTAS_OPERATIVAS_GESTIONAR)
  @ApiOperation({ summary: "Pasajeros a bordo de una unidad y su último reporte" })
  @ApiResponse({ status: 404, description: "Unidad inexistente" })
  getUnit(@Param("id") id: string): Promise<UnitOccupancyDto> {
    return this.ridershipService.getUnit(id);
  }

  @Get("alerts")
  @Permissions(ALERTAS_OPERATIVAS_GESTIONAR)
  @ApiOperation({ summary: "Alertas de capacidad por parada, más recientes primero (máx. 100)" })
  listCapacityAlerts(): Promise<CapacityAlertDto[]> {
    return this.ridershipService.listCapacityAlerts();
  }
}
