import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { LineaMunicipalidadService } from "./linea-municipalidad.service.js";
import {
  CreateLineaMunicipalidadDto,
  LineaMunicipalidadResponseDto,
} from "./dto/linea-municipalidad.dto.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";

// Sub-resource of a línea, next to /infrastructure/lineas/:id/paradas.
@ApiTags("Infraestructura - Líneas")
@Controller("infrastructure/lineas/:id/municipalidades")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class LineaMunicipalidadController {
  constructor(
    private readonly lineaMunicipalidadService: LineaMunicipalidadService
  ) {}

  @Get()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Listar las municipalidades vinculadas a una línea" })
  @ApiResponse({
    status: 200,
    description: "Municipalidades vinculadas a la línea",
    type: [LineaMunicipalidadResponseDto],
  })
  @ApiResponse({ status: 404, description: "Línea no encontrada" })
  list(@Param("id") id: string): Promise<LineaMunicipalidadResponseDto[]> {
    return this.lineaMunicipalidadService.list(id);
  }

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Vincular una municipalidad a una línea" })
  @ApiResponse({
    status: 201,
    description: "Municipalidad vinculada a la línea",
    type: LineaMunicipalidadResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Línea o municipalidad no encontrada",
  })
  @ApiResponse({
    status: 409,
    description: "La municipalidad ya está vinculada a la línea",
  })
  add(
    @Param("id") id: string,
    @Body() dto: CreateLineaMunicipalidadDto,
    @Req() request: Record<string, any>
  ): Promise<LineaMunicipalidadResponseDto> {
    return this.lineaMunicipalidadService.add(id, dto, request.user.employeeId);
  }

  @Delete(":municipalidadId")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Desvincular una municipalidad de una línea" })
  @ApiResponse({ status: 204, description: "Vínculo eliminado" })
  @ApiResponse({
    status: 404,
    description: "La municipalidad no está vinculada a la línea",
  })
  remove(
    @Param("id") id: string,
    @Param("municipalidadId") municipalidadId: string,
    @Req() request: Record<string, any>
  ): Promise<void> {
    return this.lineaMunicipalidadService.remove(
      id,
      municipalidadId,
      request.user.employeeId
    );
  }
}
