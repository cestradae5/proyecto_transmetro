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
import { MunicipalidadService } from "./municipalidad.service.js";
import { CreateMunicipalidadDto } from "./dto/create-municipalidad.dto.js";
import { UpdateMunicipalidadDto } from "./dto/update-municipalidad.dto.js";
import { MunicipalidadResponseDto } from "./dto/municipalidad-response.dto.js";
import { LineaMunicipalidadService } from "./linea-municipalidad.service.js";
import { LineaResponseDto } from "../linea/dto/linea-response.dto.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";
import { Permissions } from "../../authentication/permissions.decorator.js";

@ApiTags("Infraestructura - Municipalidades")
@Controller("infrastructure/municipalidades")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class MunicipalidadController {
  constructor(
    private readonly municipalidadService: MunicipalidadService,
    private readonly lineaMunicipalidadService: LineaMunicipalidadService
  ) {}

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Crear una nueva municipalidad" })
  @ApiResponse({
    status: 201,
    description: "Municipalidad creada exitosamente",
    type: MunicipalidadResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Ya existe una municipalidad con ese nombre",
  })
  create(
    @Body() dto: CreateMunicipalidadDto
  ): Promise<MunicipalidadResponseDto> {
    return this.municipalidadService.create(dto);
  }

  @Get()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Obtener todas las municipalidades" })
  @ApiResponse({
    status: 200,
    description: "Lista de municipalidades ordenada por nombre",
    type: [MunicipalidadResponseDto],
  })
  findAll(): Promise<MunicipalidadResponseDto[]> {
    return this.municipalidadService.findAll();
  }

  @Get(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Obtener una municipalidad por ID" })
  @ApiResponse({
    status: 200,
    description: "Municipalidad encontrada",
    type: MunicipalidadResponseDto,
  })
  @ApiResponse({ status: 404, description: "Municipalidad no encontrada" })
  findOne(@Param("id") id: string): Promise<MunicipalidadResponseDto> {
    return this.municipalidadService.findOne(id);
  }

  @Get(":id/lineas")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Listar las líneas vinculadas a una municipalidad" })
  @ApiResponse({
    status: 200,
    description: "Líneas vinculadas a la municipalidad, ordenadas por número",
    type: [LineaResponseDto],
  })
  @ApiResponse({ status: 404, description: "Municipalidad no encontrada" })
  listLineas(@Param("id") id: string): Promise<LineaResponseDto[]> {
    return this.lineaMunicipalidadService.listLineas(id);
  }

  @Patch(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Actualizar una municipalidad" })
  @ApiResponse({
    status: 200,
    description: "Municipalidad actualizada",
    type: MunicipalidadResponseDto,
  })
  @ApiResponse({ status: 404, description: "Municipalidad no encontrada" })
  @ApiResponse({
    status: 409,
    description: "Ya existe una municipalidad con ese nombre",
  })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateMunicipalidadDto
  ): Promise<MunicipalidadResponseDto> {
    return this.municipalidadService.update(id, dto);
  }

  @Delete(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Eliminar (soft delete) una municipalidad" })
  @ApiResponse({
    status: 200,
    description: "Municipalidad marcada como INACTIVA",
  })
  @ApiResponse({ status: 404, description: "Municipalidad no encontrada" })
  remove(@Param("id") id: string): Promise<void> {
    return this.municipalidadService.remove(id);
  }
}
