import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { LineaService } from "./linea.service.js";
import { CreateLineaDto } from "./dto/create-linea.dto.js";
import { UpdateLineaDto } from "./dto/update-linea.dto.js";
import { LineaResponseDto } from "./dto/linea-response.dto.js";
import { AddLineaParadaDto } from "./dto/add-linea-parada.dto.js";
import { UpdateLineaParadaDto } from "./dto/update-linea-parada.dto.js";
import { LineaParadaEntity } from "./linea-parada.entity.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";

@ApiTags("Infraestructura - Líneas")
@Controller("infrastructure/lineas")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class LineaController {
  constructor(private readonly lineaService: LineaService) {}

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Crear una nueva línea" })
  @ApiResponse({
    status: 201,
    description: "Línea creada exitosamente",
    type: LineaResponseDto,
  })
  create(@Body() createLineaDto: CreateLineaDto): Promise<LineaResponseDto> {
    return this.lineaService.create(createLineaDto);
  }

  @Get()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Obtener todas las líneas" })
  @ApiResponse({
    status: 200,
    description: "Lista de líneas",
    type: [LineaResponseDto],
  })
  findAll(): Promise<LineaResponseDto[]> {
    return this.lineaService.findAll();
  }

  @Get(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Obtener una línea por ID" })
  @ApiResponse({
    status: 200,
    description: "Línea encontrada",
    type: LineaResponseDto,
  })
  @ApiResponse({ status: 404, description: "Línea no encontrada" })
  findOne(@Param("id") id: string): Promise<LineaResponseDto> {
    return this.lineaService.findOne(id);
  }

  @Patch(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Actualizar una línea" })
  @ApiResponse({
    status: 200,
    description: "Línea actualizada",
    type: LineaResponseDto,
  })
  @ApiResponse({ status: 404, description: "Línea no encontrada" })
  update(
    @Param("id") id: string,
    @Body() updateLineaDto: UpdateLineaDto
  ): Promise<LineaResponseDto> {
    return this.lineaService.update(id, updateLineaDto);
  }

  @Delete(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Eliminar (soft delete) una línea" })
  @ApiResponse({
    status: 200,
    description: "Línea marcada como INACTIVA",
  })
  @ApiResponse({ status: 404, description: "Línea no encontrada" })
  remove(@Param("id") id: string): Promise<void> {
    return this.lineaService.remove(id);
  }

  @Get(":id/paradas")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Listar la secuencia de paradas de una línea" })
  @ApiResponse({ status: 200, description: "Paradas ordenadas por orden" })
  @ApiResponse({ status: 404, description: "Línea no encontrada" })
  listParadas(@Param("id") id: string): Promise<LineaParadaEntity[]> {
    return this.lineaService.listParadas(id);
  }

  @Post(":id/paradas")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Agregar una parada a la secuencia de la línea" })
  @ApiResponse({ status: 201, description: "Parada agregada a la línea" })
  @ApiResponse({ status: 404, description: "Línea o parada no encontrada" })
  @ApiResponse({
    status: 409,
    description: "Orden duplicado o parada ya asignada a la línea",
  })
  addParada(
    @Param("id") id: string,
    @Body() dto: AddLineaParadaDto
  ): Promise<LineaParadaEntity> {
    return this.lineaService.addParada(id, dto);
  }

  @Patch(":id/paradas/:lineaParadaId")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Actualizar orden/minutos de una parada de la línea" })
  @ApiResponse({ status: 200, description: "Parada de línea actualizada" })
  @ApiResponse({ status: 404, description: "Registro no pertenece a la línea" })
  @ApiResponse({ status: 409, description: "Orden duplicado" })
  updateParada(
    @Param("id") id: string,
    @Param("lineaParadaId") lineaParadaId: string,
    @Body() dto: UpdateLineaParadaDto
  ): Promise<LineaParadaEntity> {
    return this.lineaService.updateParada(id, lineaParadaId, dto);
  }

  @Delete(":id/paradas/:lineaParadaId")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Quitar una parada de la secuencia de la línea" })
  @ApiResponse({ status: 204, description: "Parada quitada de la línea" })
  @ApiResponse({ status: 404, description: "Registro no pertenece a la línea" })
  @ApiResponse({
    status: 409,
    description: "La línea debe conservar al menos 2 paradas",
  })
  removeParada(
    @Param("id") id: string,
    @Param("lineaParadaId") lineaParadaId: string
  ): Promise<void> {
    return this.lineaService.removeParada(id, lineaParadaId);
  }
}
