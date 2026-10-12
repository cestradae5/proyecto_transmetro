import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EstadoMunicipalidad } from "../municipalidad.entity.js";

export class CreateMunicipalidadDto {
  @ApiProperty({
    description: "Nombre de la municipalidad (único)",
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombreMunicipalidad!: string;

  @ApiProperty({ description: "Departamento", maxLength: 60 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  departamento!: string;

  // Optional: the DB defaults estado_municipalidad to ACTIVA.
  @ApiPropertyOptional({
    description: "Estado de la municipalidad",
    enum: EstadoMunicipalidad,
    default: EstadoMunicipalidad.ACTIVA,
  })
  @IsOptional()
  @IsEnum(EstadoMunicipalidad)
  estadoMunicipalidad?: EstadoMunicipalidad;
}
