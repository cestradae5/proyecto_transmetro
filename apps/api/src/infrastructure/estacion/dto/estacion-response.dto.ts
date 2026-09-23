import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EstadoEstacion } from "./create-estacion.dto.js";

export class EstacionResponseDto {
  @ApiProperty({ description: "ID de la estación" })
  idEstacion!: string;

  @ApiProperty({ description: "Nombre de la estación" })
  nombreEstacion!: string;

  @ApiProperty({ description: "Latitud" })
  latitud!: number;

  @ApiProperty({ description: "Longitud" })
  longitud!: number;

  @ApiProperty({ description: "Estado de la estación", enum: EstadoEstacion })
  estadoEstacion!: EstadoEstacion;

  @ApiPropertyOptional({ description: "ID de la parada asociada" })
  idParada?: string;
}
