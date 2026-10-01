import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../../shared/errors/domain-exception.filter.js";
import { CreateUnidadDto } from "./dto/create-unidad.dto.js";
import { UnidadResponseDto } from "./dto/unidad-response.dto.js";
import { UpdateUnidadDto } from "./dto/update-unidad.dto.js";
import { UnidadService } from "./unidad.service.js";

// Permission literal matches the DB seed value (database/init.sql,
// tbl_permiso) exactly, following the bare-string convention already used
// by LineaController/ParqueoController ("INFRAESTRUCTURA_GESTIONAR").
const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";

@ApiTags("Flota - Unidades")
@Controller("fleet/units")
@UseGuards(AuthenticationGuard)
@UseFilters(DomainExceptionFilter)
@ApiBearerAuth()
export class UnidadController {
  constructor(private readonly unidadService: UnidadService) {}

  @Post()
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Crear una nueva unidad" })
  @ApiResponse({ status: 201, description: "Unidad creada", type: UnidadResponseDto })
  @ApiResponse({ status: 409, description: "Placa duplicada o estado inválido al crear" })
  create(
    @Body() dto: CreateUnidadDto,
    @Req() request: Record<string, any>,
  ): Promise<UnidadResponseDto> {
    return this.unidadService.create(dto, request.user.employeeId);
  }

  @Get()
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Listar todas las unidades" })
  @ApiResponse({ status: 200, description: "Lista de unidades", type: [UnidadResponseDto] })
  findAll(): Promise<UnidadResponseDto[]> {
    return this.unidadService.findAll();
  }

  @Get(":id")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Obtener una unidad por ID" })
  @ApiResponse({ status: 200, description: "Unidad encontrada", type: UnidadResponseDto })
  @ApiResponse({ status: 404, description: "Unidad no encontrada" })
  findOne(@Param("id") id: string): Promise<UnidadResponseDto> {
    return this.unidadService.findOne(id);
  }

  @Patch(":id")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Actualizar una unidad" })
  @ApiResponse({ status: 200, description: "Unidad actualizada", type: UnidadResponseDto })
  @ApiResponse({ status: 404, description: "Unidad no encontrada" })
  @ApiResponse({
    status: 409,
    description: "EN_SERVICIO requiere asignación de línea y de piloto",
  })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUnidadDto,
    @Req() request: Record<string, any>,
  ): Promise<UnidadResponseDto> {
    return this.unidadService.update(id, dto, request.user.employeeId);
  }

  @Delete(":id")
  @Permissions(FLOTA_GESTIONAR)
  @ApiOperation({ summary: "Eliminar (lógicamente) una unidad" })
  @ApiResponse({
    status: 200,
    description: "Unidad marcada como FUERA_DE_SERVICIO",
    type: UnidadResponseDto,
  })
  @ApiResponse({ status: 404, description: "Unidad no encontrada" })
  remove(
    @Param("id") id: string,
    @Req() request: Record<string, any>,
  ): Promise<UnidadResponseDto> {
    return this.unidadService.remove(id, request.user.employeeId);
  }
}
