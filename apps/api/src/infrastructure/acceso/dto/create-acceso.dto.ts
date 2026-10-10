import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { EstadoAcceso, TipoAcceso } from "../acceso.entity.js";

// The owning parada comes from the route (/infrastructure/paradas/:id/accesos),
// so idParada is intentionally not part of the body.
export class CreateAccesoDto {
  @ApiProperty({ example: "Acceso norte", maxLength: 120 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  nombreAcceso!: string;

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

  @ApiProperty({ enum: TipoAcceso, example: TipoAcceso.PEATONAL })
  @IsNotEmpty()
  @IsEnum(TipoAcceso)
  tipoAcceso!: TipoAcceso;

  // Optional: the DB defaults estado_acceso to HABILITADO.
  @ApiPropertyOptional({
    enum: EstadoAcceso,
    default: EstadoAcceso.HABILITADO,
  })
  @IsOptional()
  @IsEnum(EstadoAcceso)
  estadoAcceso?: EstadoAcceso;
}
