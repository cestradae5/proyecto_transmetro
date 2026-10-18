import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsString, Max, Min, ValidateIf } from "class-validator";

import { EstadoParada } from "../parada.entity.js";

export class CreateParadaDto {
  @ApiProperty({ example: "Parada Central", maxLength: 120 })
  @IsNotEmpty()
  @IsString()
  nombreParada!: string;

  @ApiProperty({ example: 14.6349, minimum: -90, maximum: 90 })
  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud!: number;

  @ApiProperty({ example: -90.5069, minimum: -180, maximum: 180 })
  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud!: number;

  @ApiProperty({ enum: EstadoParada, example: EstadoParada.ACTIVA })
  @IsNotEmpty()
  @IsEnum(EstadoParada)
  estadoParada!: EstadoParada;

  // Absent -> DB default (100); null is rejected (the column is NOT NULL).
  @ApiPropertyOptional({ description: "Capacidad de pasajeros esperando en la parada", minimum: 1, default: 100 })
  @ValidateIf((o: { capacidadPasajeros?: unknown }) => o.capacidadPasajeros !== undefined)
  @IsInt()
  @Min(1)
  capacidadPasajeros?: number;
}
