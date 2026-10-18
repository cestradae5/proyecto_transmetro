import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { ALERTAS_OPERATIVAS_GESTIONAR } from "../alerts/alerta.constants.js";
import { FLOTA_GESTIONAR } from "./ridership.constants.js";
import { RidershipService } from "./ridership.service.js";
import { TurnstileKeyGuard } from "./turnstile-key.guard.js";
import { TurnstilePassDto, UnitArrivalDto } from "./dto/ridership-request.dto.js";
import type {
  CapacityAlertDto,
  ParadaOccupancyDto,
  TurnstilePassResponseDto,
  UnitOccupancyDto,
  UnitStopDto,
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

// S8, S9: bus stops (reported like unit locations, FLOTA_GESTIONAR) and
// occupancy readings for central operation (ALERTAS_OPERATIVAS_GESTIONAR).
@ApiTags("Operación - Conteo de pasajeros")
@Controller("operations/ridership")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class RidershipController {
  constructor(private readonly ridershipService: RidershipService) {}

  @Post("units/:id/arrival")
  @HttpCode(HttpStatus.CREATED)
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "La unidad llega a una estación: suben los que esperan y aplica la regla del 25%" })
  @ApiResponse({ status: 201, description: "Parada abierta con ocupación y minutos de espera extra" })
  @ApiResponse({ status: 404, description: "Unidad o estación inexistente" })
  @ApiResponse({ status: 409, description: "La unidad ya está detenida en una estación" })
  arrive(@Param("id") id: string, @Body() dto: UnitArrivalDto): Promise<UnitStopDto> {
    return this.ridershipService.arrive(id, dto);
  }

  @Post("units/:id/departure")
  @HttpCode(HttpStatus.OK)
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "La unidad sale de la estación: bajan las salidas registradas y suben los nuevos" })
  @ApiResponse({ status: 200, description: "Parada cerrada" })
  @ApiResponse({ status: 404, description: "Unidad inexistente" })
  @ApiResponse({ status: 409, description: "La unidad no está detenida en ninguna estación" })
  depart(@Param("id") id: string): Promise<UnitStopDto> {
    return this.ridershipService.depart(id);
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
  @ApiOperation({ summary: "Ocupación estimada de la unidad y su parada abierta" })
  @ApiResponse({ status: 404, description: "Unidad inexistente" })
  getUnit(@Param("id") id: string): Promise<UnitOccupancyDto> {
    return this.ridershipService.getUnit(id);
  }

  @Get("alerts")
  @Permissions(ALERTAS_OPERATIVAS_GESTIONAR)
  @ApiOperation({ summary: "Alertas de capacidad de estación, más recientes primero (máx. 100)" })
  listCapacityAlerts(): Promise<CapacityAlertDto[]> {
    return this.ridershipService.listCapacityAlerts();
  }
}
