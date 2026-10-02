import { Controller, Get, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { PilotoResponseDto } from "./dto/piloto-response.dto.js";
import { PilotoService } from "./piloto.service.js";

// Permission literal matches the DB seed value (database/init.sql,
// tbl_permiso), following the bare-string convention of the other fleet
// controllers.
const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";

// "fleet/pilots" does not collide with "fleet/units/:id".
@ApiTags("Flota - Pilotos")
@Controller("fleet/pilots")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class PilotoController {
  constructor(private readonly pilotoService: PilotoService) {}

  @Get()
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Listar pilotos activos elegibles para asignación" })
  @ApiResponse({
    status: 200,
    description: "Pilotos activos ordenados por nombre, con su unidad asignada si existe",
    type: PilotoResponseDto,
    isArray: true,
  })
  list(): Promise<PilotoResponseDto[]> {
    return this.pilotoService.listEligiblePilots();
  }
}
