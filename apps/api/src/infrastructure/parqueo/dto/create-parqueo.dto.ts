import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsInt,
  IsOptional,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum TipoParqueo {
  CENTRAL = "CENTRAL",
  AUXILIAR = "AUXILIAR",
  TEMPORAL = "TEMPORAL",
}

export enum EstadoParqueo {
  ACTIVO = "ACTIVO",
  CERRADO = "CERRADO",
  MANTENIMIENTO = "MANTENIMIENTO",
}

export class CreateParqueoDto {
  @ApiProperty({ description: "Nombre del parqueo", maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  nombreParqueo!: string;

  @ApiProperty({
    description: "Tipo de parqueo",
    enum: TipoParqueo,
  })
  @IsEnum(TipoParqueo)
  tipoParqueo!: TipoParqueo;

  @ApiProperty({ description: "Dirección del parqueo", maxLength: 250 })
  @IsString()
  @IsNotEmpty()
  direccion!: string;

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
    description: "Capacidad de unidades (buses)",
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  capacidadUnidades!: number;

  @ApiProperty({
    description: "Estado del parqueo",
    enum: EstadoParqueo,
    default: EstadoParqueo.ACTIVO,
  })
  @IsEnum(EstadoParqueo)
  estadoParqueo!: EstadoParqueo;

  @ApiPropertyOptional({ description: "ID de la estación asociada (opcional)" })
  @IsOptional()
  @IsString()
  idEstacion?: string;
}
