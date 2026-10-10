import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { AccesoService } from "./acceso.service.js";
import { AccesoResponseDto } from "./dto/acceso-response.dto.js";
import { CreateAccesoDto } from "./dto/create-acceso.dto.js";
import { UpdateAccesoDto } from "./dto/update-acceso.dto.js";

// Sub-resource of a parada, next to /infrastructure/paradas/:id.
@ApiTags("Infraestructura - Paradas")
@Controller("infrastructure/paradas/:id/accesos")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class AccesoController {
  constructor(private readonly accesoService: AccesoService) {}

  @Get()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Listar los accesos de una parada" })
  @ApiResponse({
    status: 200,
    description: "Accesos de la parada ordenados por nombre",
    type: [AccesoResponseDto],
  })
  @ApiResponse({ status: 404, description: "Parada no encontrada" })
  list(@Param("id") id: string): Promise<AccesoResponseDto[]> {
    return this.accesoService.list(id);
  }

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Crear un acceso en una parada" })
  @ApiResponse({
    status: 201,
    description: "Acceso creado exitosamente",
    type: AccesoResponseDto,
  })
  @ApiResponse({ status: 404, description: "Parada no encontrada" })
  create(
    @Param("id") id: string,
    @Body() dto: CreateAccesoDto
  ): Promise<AccesoResponseDto> {
    return this.accesoService.create(id, dto);
  }

  @Get(":accesoId")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Obtener un acceso de una parada" })
  @ApiResponse({
    status: 200,
    description: "Acceso encontrado",
    type: AccesoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Parada no encontrada o el acceso no pertenece a la parada",
  })
  findOne(
    @Param("id") id: string,
    @Param("accesoId") accesoId: string
  ): Promise<AccesoResponseDto> {
    return this.accesoService.findOne(id, accesoId);
  }

  @Patch(":accesoId")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Actualizar un acceso de una parada" })
  @ApiResponse({
    status: 200,
    description: "Acceso actualizado",
    type: AccesoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Parada no encontrada o el acceso no pertenece a la parada",
  })
  update(
    @Param("id") id: string,
    @Param("accesoId") accesoId: string,
    @Body() dto: UpdateAccesoDto
  ): Promise<AccesoResponseDto> {
    return this.accesoService.update(id, accesoId, dto);
  }

  @Delete(":accesoId")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Eliminar (soft delete) un acceso de una parada" })
  @ApiResponse({
    status: 200,
    description: "Acceso marcado como DESHABILITADO",
  })
  @ApiResponse({
    status: 404,
    description: "Parada no encontrada o el acceso no pertenece a la parada",
  })
  remove(
    @Param("id") id: string,
    @Param("accesoId") accesoId: string
  ): Promise<void> {
    return this.accesoService.remove(id, accesoId);
  }
}
