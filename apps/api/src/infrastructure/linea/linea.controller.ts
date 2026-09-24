import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
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
    description: "Línea marcada como CERRADA",
  })
  @ApiResponse({ status: 404, description: "Línea no encontrada" })
  remove(@Param("id") id: string): Promise<void> {
    return this.lineaService.remove(id);
  }
}
