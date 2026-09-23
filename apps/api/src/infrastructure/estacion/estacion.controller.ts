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
import { EstacionService } from "./estacion.service.js";
import { CreateEstacionDto } from "./dto/create-estacion.dto.js";
import { UpdateEstacionDto } from "./dto/update-estacion.dto.js";
import { EstacionResponseDto } from "./dto/estacion-response.dto.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";

@ApiTags("Infraestructura - Estaciones")
@Controller("infrastructure/estaciones")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class EstacionController {
  constructor(private readonly estacionService: EstacionService) {}

  @Post()
  @ApiOperation({ summary: "Crear una nueva estación" })
  @ApiResponse({
    status: 201,
    description: "Estación creada exitosamente",
    type: EstacionResponseDto,
  })
  create(
    @Body() createEstacionDto: CreateEstacionDto
  ): Promise<EstacionResponseDto> {
    return this.estacionService.create(createEstacionDto);
  }

  @Get()
  @ApiOperation({ summary: "Obtener todas las estaciones" })
  @ApiResponse({
    status: 200,
    description: "Lista de estaciones",
    type: [EstacionResponseDto],
  })
  findAll(): Promise<EstacionResponseDto[]> {
    return this.estacionService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Obtener una estación por ID" })
  @ApiResponse({
    status: 200,
    description: "Estación encontrada",
    type: EstacionResponseDto,
  })
  @ApiResponse({ status: 404, description: "Estación no encontrada" })
  findOne(@Param("id") id: string): Promise<EstacionResponseDto> {
    return this.estacionService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Actualizar una estación" })
  @ApiResponse({
    status: 200,
    description: "Estación actualizada",
    type: EstacionResponseDto,
  })
  @ApiResponse({ status: 404, description: "Estación no encontrada" })
  update(
    @Param("id") id: string,
    @Body() updateEstacionDto: UpdateEstacionDto
  ): Promise<EstacionResponseDto> {
    return this.estacionService.update(id, updateEstacionDto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar (soft delete) una estación" })
  @ApiResponse({
    status: 200,
    description: "Estación marcada como CERRADA",
  })
  @ApiResponse({ status: 404, description: "Estación no encontrada" })
  remove(@Param("id") id: string): Promise<void> {
    return this.estacionService.remove(id);
  }
}
