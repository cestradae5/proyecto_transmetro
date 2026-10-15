import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import {
  EstadoAsignacionLinea,
  TipoPunto,
} from "../estacion-linea.entity.js";

export class CreateEstacionLineaDto {
  @ApiProperty({ description: "ID de la línea a vincular" })
  @IsString()
  @IsNotEmpty()
  idLinea!: string;

  @ApiProperty({ enum: TipoPunto })
  @IsEnum(TipoPunto)
  tipoPunto!: TipoPunto;

  @ApiPropertyOptional({
    enum: EstadoAsignacionLinea,
    default: EstadoAsignacionLinea.ACTIVA,
  })
  @IsOptional()
  @IsEnum(EstadoAsignacionLinea)
  estadoAsignacion?: EstadoAsignacionLinea;
}

export class UpdateEstacionLineaDto {
  @ApiPropertyOptional({ enum: TipoPunto })
  @IsOptional()
  @IsEnum(TipoPunto)
  tipoPunto?: TipoPunto;

  @ApiPropertyOptional({ enum: EstadoAsignacionLinea })
  @IsOptional()
  @IsEnum(EstadoAsignacionLinea)
  estadoAsignacion?: EstadoAsignacionLinea;
}

export class EstacionLineaAvailableDto {
  @ApiProperty() idLinea!: string;
  @ApiProperty() numeroLinea!: string;
  @ApiProperty() nombreLinea!: string;
}

export class EstacionLineaResponseDto {
  @ApiProperty() idEstacion!: string;
  @ApiProperty() idLinea!: string;
  @ApiPropertyOptional() nombreLinea?: string;
  @ApiProperty({ enum: TipoPunto }) tipoPunto!: TipoPunto;
  @ApiProperty({ enum: EstadoAsignacionLinea })
  estadoAsignacion!: EstadoAsignacionLinea;
}
