import { ApiProperty } from "@nestjs/swagger";
import { EstadoEstacion } from "./create-estacion.dto.js";

export class EstacionResponseDto {
  @ApiProperty({ description: "ID de la estación" })
  idEstacion!: number;

  @ApiProperty({ description: "Nombre de la estación" })
  nombreEstacion!: string;

  @ApiProperty({ description: "Latitud" })
  latitud!: number;

  @ApiProperty({ description: "Longitud" })
  longitud!: number;

  @ApiProperty({ description: "Estado de la estación", enum: EstadoEstacion })
  estadoEstacion!: EstadoEstacion;

  @ApiProperty({ description: "ID de la parada que la estación extiende" })
  idParada!: number;
}
