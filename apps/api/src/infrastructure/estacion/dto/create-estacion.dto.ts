import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsInt,
  ValidateIf,
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

  // Waiting-passenger capacity; the ridership alert fires at 150% of it.
  @ApiPropertyOptional({
    description: "Capacidad de pasajeros esperando en la estación",
    minimum: 1,
    default: 100,
  })
  // Absent -> DB default; null is rejected (the column is NOT NULL).
  @ValidateIf((o: { capacidadPasajeros?: unknown }) => o.capacidadPasajeros !== undefined)
  @IsInt()
  @Min(1)
  capacidadPasajeros?: number;

  // Required: an estación is a 1:1 extension of an existing parada.
  @ApiProperty({ description: "ID de la parada que la estación extiende" })
  @IsNumber()
  idParada!: number;
}
