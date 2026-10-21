import {
  Controller,
  Get,
  Post,
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
import { AfectacionResponseDto } from "./dto/afectacion-response.dto.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";

@ApiTags("Infraestructura - Afectaciones")
// Afectaciones are an append-only history of applied actions: editing or
// deleting one would desync it from the target's real state, so there is no
// PATCH or DELETE. Reverting is a new afectación with the opposite action.
@Controller("infrastructure/afectaciones")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class AfectacionController {
  constructor(private readonly afectacionService: AfectacionService) {}

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({
    summary:
      "Activar o desactivar una línea, parada o estación (queda en la bitácora)",
  })
  @ApiResponse({
    status: 201,
    description: "Afectación aplicada",
    type: AfectacionResponseDto,
  })
  @ApiResponse({ status: 400, description: "Objetivo o fechas inválidos" })
  @ApiResponse({ status: 404, description: "Línea, parada o estación no encontrada" })
  @ApiResponse({ status: 409, description: "El objetivo ya está en ese estado" })
  create(
    @Body() createAfectacionDto: CreateAfectacionDto,
    @Req() request: Record<string, any>
  ): Promise<AfectacionResponseDto> {
    return this.afectacionService.create(createAfectacionDto, request.user.employeeId);
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
