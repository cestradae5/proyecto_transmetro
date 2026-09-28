import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TipoAfectacion, EstadoAfectacion } from "./create-afectacion.dto.js";

export class AfectacionResponseDto {
  @ApiProperty({ description: "ID de la afectación" })
  idAfectacion!: string;

  @ApiProperty({ description: "Tipo de afectación", enum: TipoAfectacion })
  tipoAfectacion!: TipoAfectacion;

  @ApiProperty({ description: "Motivo de la afectación" })
  motivo!: string;

  @ApiProperty({ description: "Fecha de inicio" })
  fechaInicio!: Date;

  @ApiPropertyOptional({ description: "Fecha de fin" })
  fechaFin?: Date;

  @ApiProperty({ description: "Estado de la afectación", enum: EstadoAfectacion })
  estadoAfectacion!: EstadoAfectacion;

  @ApiPropertyOptional({ description: "ID de la parada afectada" })
  idParada?: string;

  @ApiPropertyOptional({ description: "ID de la estación afectada" })
  idEstacion?: string;
}
