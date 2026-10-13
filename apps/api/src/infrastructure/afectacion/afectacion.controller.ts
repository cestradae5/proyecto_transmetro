import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
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
@Controller("infrastructure/afectaciones")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class AfectacionController {
  constructor(private readonly afectacionService: AfectacionService) {}

  @Post()
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Crear una nueva afectación" })
  @ApiResponse({
    status: 201,
    description: "Afectación creada exitosamente",
    type: AfectacionResponseDto,
  })
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

  // Declared before PATCH ":id" for readability; ":id" only matches a single
  // path segment, so "/:id/close" never collides with it regardless of order.
  @Patch(":id/close")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({
    summary: "Cerrar una afectación (estado CERRADA, fechaFin = ahora)",
  })
  @ApiResponse({
    status: 200,
    description: "Afectación cerrada",
    type: AfectacionResponseDto,
  })
  @ApiResponse({ status: 404, description: "Afectación no encontrada" })
  @ApiResponse({ status: 409, description: "La afectación ya está cerrada" })
  close(
    @Param("id") id: string,
    @Req() request: Record<string, any>
  ): Promise<AfectacionResponseDto> {
    return this.afectacionService.close(id, request.user.employeeId);
  }

  @Patch(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Actualizar una afectación" })
  @ApiResponse({
    status: 200,
    description: "Afectación actualizada",
    type: AfectacionResponseDto,
  })
  @ApiResponse({ status: 404, description: "Afectación no encontrada" })
  update(
    @Param("id") id: string,
    @Body() updateAfectacionDto: UpdateAfectacionDto,
    @Req() request: Record<string, any>
  ): Promise<AfectacionResponseDto> {
    return this.afectacionService.update(id, updateAfectacionDto, request.user.employeeId);
  }

  @Delete(":id")
  @Permissions("INFRAESTRUCTURA_GESTIONAR")
  @ApiOperation({ summary: "Eliminar (soft delete) una afectación" })
  @ApiResponse({
    status: 200,
    description: "Afectación marcada como CERRADA",
  })
  @ApiResponse({ status: 404, description: "Afectación no encontrada" })
  remove(
    @Param("id") id: string,
    @Req() request: Record<string, any>
  ): Promise<void> {
    return this.afectacionService.remove(id, request.user.employeeId);
  }
}
