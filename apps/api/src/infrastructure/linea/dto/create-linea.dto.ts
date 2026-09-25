import { IsString, IsNotEmpty, IsEnum, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

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

  @ApiProperty({ description: "ID del parqueo asociado" })
  @IsString()
  @IsNotEmpty()
  idParqueo!: string;
}
