import { Controller, Get, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { OperadorEstacionResponseDto } from "./dto/operador-estacion-response.dto.js";
import { OperadorEstacionService } from "./operador-estacion.service.js";

const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";

@ApiTags("Flota - Operadores de estación")
@Controller("fleet/station-operators")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class OperadorEstacionController {
  constructor(private readonly operadorEstacionService: OperadorEstacionService) {}

  @Get()
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Listar operadores de estación activos elegibles para asignación" })
  @ApiResponse({
    status: 200,
    description: "Operadores activos ordenados por nombre, con su estación actual si existe",
    type: OperadorEstacionResponseDto,
    isArray: true,
  })
  list(): Promise<OperadorEstacionResponseDto[]> {
    return this.operadorEstacionService.listOperators();
  }
}
