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
import { ParqueoService } from "./parqueo.service.js";
import { CreateParqueoDto } from "./dto/create-parqueo.dto.js";
import { UpdateParqueoDto } from "./dto/update-parqueo.dto.js";
import { ParqueoResponseDto } from "./dto/parqueo-response.dto.js";
import { AuthenticationGuard } from "../../authentication/authentication.guard.js";

@ApiTags("Infraestructura - Parqueos")
@Controller("infrastructure/parqueos")
@UseGuards(AuthenticationGuard)
@ApiBearerAuth()
export class ParqueoController {
  constructor(private readonly parqueoService: ParqueoService) {}

  @Post()
  @ApiOperation({ summary: "Crear un nuevo parqueo" })
  @ApiResponse({
    status: 201,
    description: "Parqueo creado exitosamente",
    type: ParqueoResponseDto,
  })
  create(
    @Body() createParqueoDto: CreateParqueoDto
  ): Promise<ParqueoResponseDto> {
    return this.parqueoService.create(createParqueoDto);
  }

  @Get()
  @ApiOperation({ summary: "Obtener todos los parqueos" })
  @ApiResponse({
    status: 200,
    description: "Lista de parqueos",
    type: [ParqueoResponseDto],
  })
  findAll(): Promise<ParqueoResponseDto[]> {
    return this.parqueoService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Obtener un parqueo por ID" })
  @ApiResponse({
    status: 200,
    description: "Parqueo encontrado",
    type: ParqueoResponseDto,
  })
  @ApiResponse({ status: 404, description: "Parqueo no encontrado" })
  findOne(@Param("id") id: string): Promise<ParqueoResponseDto> {
    return this.parqueoService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Actualizar un parqueo" })
  @ApiResponse({
    status: 200,
    description: "Parqueo actualizado",
    type: ParqueoResponseDto,
  })
  @ApiResponse({ status: 404, description: "Parqueo no encontrado" })
  update(
    @Param("id") id: string,
    @Body() updateParqueoDto: UpdateParqueoDto
  ): Promise<ParqueoResponseDto> {
    return this.parqueoService.update(id, updateParqueoDto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar (soft delete) un parqueo" })
  @ApiResponse({
    status: 200,
    description: "Parqueo marcado como CERRADO",
  })
  @ApiResponse({ status: 404, description: "Parqueo no encontrado" })
  remove(@Param("id") id: string): Promise<void> {
    return this.parqueoService.remove(id);
  }
}
