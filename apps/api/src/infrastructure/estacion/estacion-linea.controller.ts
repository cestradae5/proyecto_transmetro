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
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EstacionLineaService } from "./estacion-linea.service.js";
import {
  CreateEstacionLineaDto,
  EstacionLineaResponseDto,
  UpdateEstacionLineaDto,
} from "./dto/estacion-linea.dto.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";

@ApiTags("Infraestructura - Estaciones")
@Controller("infrastructure/stations/:id/lines")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class EstacionLineaController {
  constructor(private readonly estacionLineaService: EstacionLineaService) {}

  @Get()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Listar las líneas vinculadas a una estación" })
  list(@Param("id") id: string): Promise<EstacionLineaResponseDto[]> {
    return this.estacionLineaService.list(id);
  }

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Vincular una línea a una estación" })
  add(
    @Param("id") id: string,
    @Body() dto: CreateEstacionLineaDto,
    @Req() request: Record<string, any>
  ): Promise<EstacionLineaResponseDto> {
    return this.estacionLineaService.add(id, dto, request.user.employeeId);
  }

  @Patch(":lineId")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Actualizar el vínculo estación-línea" })
  update(
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() dto: UpdateEstacionLineaDto,
    @Req() request: Record<string, any>
  ): Promise<EstacionLineaResponseDto> {
    return this.estacionLineaService.update(id, lineId, dto, request.user.employeeId);
  }

  @Delete(":lineId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Eliminar el vínculo estación-línea" })
  remove(
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Req() request: Record<string, any>
  ): Promise<void> {
    return this.estacionLineaService.remove(id, lineId, request.user.employeeId);
  }
}
