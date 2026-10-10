import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum EstadoLinea {
  ACTIVA = "ACTIVA",
  INACTIVA = "INACTIVA",
}

export enum TipoRecorrido {
  CIRCULAR = "CIRCULAR",
  LINEAL = "LINEAL",
}

export class CreateLineaDto {
  @ApiProperty({ description: "Número de línea", maxLength: 10 })
  @IsString()
  @IsNotEmpty()
  numeroLinea!: string;

  @ApiProperty({ description: "Nombre de la línea", maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  nombreLinea!: string;

  @ApiProperty({
    description: "Color en formato hexadecimal (#RRGGBB)",
    example: "#FF5733",
  })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: "El color debe estar en formato hexadecimal #RRGGBB",
  })
  colorHex!: string;

  @ApiProperty({
    description: "Estado de la línea",
    enum: EstadoLinea,
    default: EstadoLinea.ACTIVA,
  })
  @IsEnum(EstadoLinea)
  estadoLinea!: EstadoLinea;

  @ApiProperty({
    description: "Tipo de recorrido de la línea",
    enum: TipoRecorrido,
  })
  @IsEnum(TipoRecorrido)
  tipoRecorrido!: TipoRecorrido;

  // Optional: a línea can be created before any parqueo exists. `null` is
  // accepted (e.g. on update, to clear the assignment): @IsOptional skips the
  // remaining validators for both null and undefined.
  @ApiPropertyOptional({
    description: "ID del parqueo asociado (opcional)",
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idParqueo?: string | null;
}
