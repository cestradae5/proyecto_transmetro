import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsDateString,
  IsOptional,
  ValidateIf,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum TipoAfectacion {
  TEMPORAL = "TEMPORAL",
  PERMANENTE = "PERMANENTE",
  MANTENIMIENTO = "MANTENIMIENTO",
}

export enum EstadoAfectacion {
  ACTIVA = "ACTIVA",
  CERRADA = "CERRADA",
  PENDIENTE = "PENDIENTE",
}

export class CreateAfectacionDto {
  @ApiProperty({
    description: "Tipo de afectación",
    enum: TipoAfectacion,
  })
  @IsEnum(TipoAfectacion)
  tipoAfectacion!: TipoAfectacion;

  @ApiProperty({ description: "Motivo de la afectación" })
  @IsString()
  @IsNotEmpty()
  motivo!: string;

  @ApiProperty({
    description: "Fecha de inicio (YYYY-MM-DD)",
    example: "2024-01-15",
  })
  @IsDateString()
  fechaInicio!: string;

  @ApiPropertyOptional({
    description: "Fecha de fin (YYYY-MM-DD)",
    example: "2024-01-20",
  })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @ApiProperty({
    description: "Estado de la afectación",
    enum: EstadoAfectacion,
    default: EstadoAfectacion.ACTIVA,
  })
  @IsEnum(EstadoAfectacion)
  estadoAfectacion!: EstadoAfectacion;

  @ApiPropertyOptional({
    description: "ID de la parada afectada (XOR con idEstacion)",
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.idEstacion)
  @IsNotEmpty({ message: "Debe proporcionar idParada o idEstacion, no ambos" })
  idParada?: string;

  @ApiPropertyOptional({
    description: "ID de la estación afectada (XOR con idParada)",
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.idParada)
  @IsNotEmpty({ message: "Debe proporcionar idParada o idEstacion, no ambos" })
  idEstacion?: string;
}
