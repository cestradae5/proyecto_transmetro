import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsOptional,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum EstadoEstacion {
  ACTIVA = "ACTIVA",
  CERRADA = "CERRADA",
  MANTENIMIENTO = "MANTENIMIENTO",
}

export class CreateEstacionDto {
  @ApiProperty({ description: "Nombre de la estación", maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  nombreEstacion!: string;

  @ApiProperty({ description: "Latitud (-90 a 90)", minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitud!: number;

  @ApiProperty({
    description: "Longitud (-180 a 180)",
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitud!: number;

  @ApiProperty({
    description: "Estado de la estación",
    enum: EstadoEstacion,
    default: EstadoEstacion.ACTIVA,
  })
  @IsEnum(EstadoEstacion)
  estadoEstacion!: EstadoEstacion;

  @ApiPropertyOptional({ description: "ID de la parada asociada (opcional)" })
  @IsOptional()
  @IsString()
  idParada?: string;
}
