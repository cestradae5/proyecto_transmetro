import { Controller, Get, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import type { MiEstacionResponseDto } from "./dto/mi-estacion-response.dto.js";
import { EstacionOperadorService } from "./estacion-operador.service.js";

const FLOTA_ESTACION_CONSULTAR = "FLOTA_ESTACION_CONSULTAR";

// "fleet/my-station" shares no path prefix with "fleet/units/:id" or
// "fleet/station-assignments/:id", so route ordering in FleetModule is not a
// concern.
@ApiTags("Flota - Mi estación")
@Controller("fleet/my-station")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class EstacionOperadorController {
  constructor(private readonly estacionOperadorService: EstacionOperadorService) {}

  @Get()
  @Permissions(FLOTA_ESTACION_CONSULTAR)
  @ApiOperation({
    summary: "Consultar la estación asignada al operador: paradas, líneas y unidades",
  })
  @ApiResponse({ status: 200, description: "Estación, líneas con paradas y unidades" })
  @ApiResponse({ status: 404, description: "El operador no tiene una estación asignada" })
  getMyStation(@Req() request: Record<string, any>): Promise<MiEstacionResponseDto> {
    return this.estacionOperadorService.getMyStation(request.user.employeeId);
  }
}
