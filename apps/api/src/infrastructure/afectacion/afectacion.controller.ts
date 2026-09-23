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
import { AfectacionService } from "./afectacion.service.js";
import { CreateAfectacionDto } from "./dto/create-afectacion.dto.js";
import { UpdateAfectacionDto } from "./dto/update-afectacion.dto.js";
import { AfectacionResponseDto } from "./dto/afectacion-response.dto.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";

@ApiTags("Infraestructura - Afectaciones")
@Controller("infrastructure/afectaciones")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class AfectacionController {
  constructor(private readonly afectacionService: AfectacionService) {}

  @Post()
  @ApiOperation({ summary: "Crear una nueva afectación" })
  @ApiResponse({
    status: 201,
    description: "Afectación creada exitosamente",
    type: AfectacionResponseDto,
  })
  create(
    @Body() createAfectacionDto: CreateAfectacionDto
  ): Promise<AfectacionResponseDto> {
    return this.afectacionService.create(createAfectacionDto);
  }

  @Get()
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

  @Patch(":id")
  @ApiOperation({ summary: "Actualizar una afectación" })
  @ApiResponse({
    status: 200,
    description: "Afectación actualizada",
    type: AfectacionResponseDto,
  })
  @ApiResponse({ status: 404, description: "Afectación no encontrada" })
  update(
    @Param("id") id: string,
    @Body() updateAfectacionDto: UpdateAfectacionDto
  ): Promise<AfectacionResponseDto> {
    return this.afectacionService.update(id, updateAfectacionDto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar (soft delete) una afectación" })
  @ApiResponse({
    status: 200,
    description: "Afectación marcada como CERRADA",
  })
  @ApiResponse({ status: 404, description: "Afectación no encontrada" })
  remove(@Param("id") id: string): Promise<void> {
    return this.afectacionService.remove(id);
  }
}
