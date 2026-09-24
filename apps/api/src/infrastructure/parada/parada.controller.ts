import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { CreateParadaDto } from "./dto/create-parada.dto.js";
import { ParadaResponseDto } from "./dto/parada-response.dto.js";
import { UpdateParadaDto } from "./dto/update-parada.dto.js";
import { ParadaService } from "./parada.service.js";

@ApiTags("Infrastructure")
@ApiBearerAuth()
@UseGuards(AuthenticationGuard)
@Controller("infrastructure/paradas")
export class ParadaController {
  constructor(private readonly paradaService: ParadaService) {}

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Crear nueva parada" })
  @ApiResponse({ status: 201, type: ParadaResponseDto })
  async create(@Body() dto: CreateParadaDto): Promise<ParadaResponseDto> {
    return this.paradaService.create(dto);
  }

  @Get()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Listar todas las paradas" })
  @ApiResponse({ status: 200, type: [ParadaResponseDto] })
  async findAll(): Promise<ParadaResponseDto[]> {
    return this.paradaService.findAll();
  }

  @Get(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Obtener parada por ID" })
  @ApiResponse({ status: 200, type: ParadaResponseDto })
  @ApiResponse({ status: 404, description: "Parada no encontrada" })
  async findOne(@Param("id") id: string): Promise<ParadaResponseDto> {
    return this.paradaService.findOne(id);
  }

  @Patch(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Actualizar parada" })
  @ApiResponse({ status: 200, type: ParadaResponseDto })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateParadaDto,
  ): Promise<ParadaResponseDto> {
    return this.paradaService.update(id, dto);
  }

  @Delete(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Eliminar parada (soft delete → CERRADA)" })
  @ApiResponse({ status: 204, description: "Parada eliminada" })
  async remove(
    @Param("id") id: string,
    @Query("force") force?: string,
  ): Promise<void> {
    return this.paradaService.remove(id, force === "true");
  }
}
