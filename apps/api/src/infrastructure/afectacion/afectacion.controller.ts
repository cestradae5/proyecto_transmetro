import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { AfectacionService } from "./afectacion.service.js";
import { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import { UpdateAfectacionDto } from "./dto/update-afectacion.dto.js";
import { AfectacionResponseDto } from "./dto/afectacion-response.dto.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";

@ApiTags("Infraestructura - Afectaciones")
// An afectación is applied when created and re-applied when its acción is
// edited, so its stored changes always match the target's state. There is no
// DELETE: removing one would lose the record of what it changed.
@Controller("infrastructure/afectaciones")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class AfectacionController {
  constructor(private readonly afectacionService: AfectacionService) {}

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({
    summary:
      "Activar o desactivar una municipalidad, línea, parada o estación, con cascada (queda en la bitácora)",
  })
  @ApiResponse({
    status: 201,
    description: "Afectación aplicada",
    type: AfectacionResponseDto,
  })
  @ApiResponse({ status: 400, description: "Objetivo o fechas inválidos" })
  @ApiResponse({ status: 404, description: "Municipalidad, línea, parada o estación no encontrada" })
  @ApiResponse({ status: 409, description: "El objetivo ya está en ese estado" })
  create(
    @Body() createAfectacionDto: CreateAfectacionDto,
    @Req() request: Record<string, any>
  ): Promise<AfectacionResponseDto> {
    return this.afectacionService.create(createAfectacionDto, request.user.employeeId);
  }

  @Patch(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({
    summary: "Editar acción, motivo o fechas de una afectación (cambiar la acción la aplica)",
  })
  @ApiResponse({ status: 200, description: "Afectación editada", type: AfectacionResponseDto })
  @ApiResponse({ status: 400, description: "Fechas o campos inválidos" })
  @ApiResponse({ status: 404, description: "Afectación no encontrada" })
  @ApiResponse({
    status: 409,
    description: "No es la afectación más reciente del objetivo, es una afectación anterior, o el objetivo ya está en ese estado",
  })
  update(
    @Param("id") id: string,
    @Body() updateAfectacionDto: UpdateAfectacionDto,
    @Req() request: Record<string, any>
  ): Promise<AfectacionResponseDto> {
    return this.afectacionService.update(id, updateAfectacionDto, request.user.employeeId);
  }

  @Get()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Obtener todas las afectaciones" })
  @ApiResponse({
    status: 200,
    description: "Lista de afectaciones",
    type: [AfectacionResponseDto],
  })
  findAll(): Promise<AfectacionResponseDto[]> {
    return this.afectacionService.findAll();
  }

  @Get(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Obtener una afectación por ID" })
  @ApiResponse({
    status: 200,
    description: "Afectación encontrada",
    type: AfectacionResponseDto,
  })
  @ApiResponse({ status: 404, description: "Afectación no encontrada" })
  findOne(@Param("id") id: string): Promise<AfectacionResponseDto> {
    return this.afectacionService.findOne(id);
  }
}
