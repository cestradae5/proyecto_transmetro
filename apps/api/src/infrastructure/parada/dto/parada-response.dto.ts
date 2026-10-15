import { ApiProperty } from "@nestjs/swagger";

import { EstadoParada } from "../parada.entity.js";

export class ParadaResponseDto {
  @ApiProperty()
  idParada!: number;

  @ApiProperty()
  nombreParada!: string;

  @ApiProperty()
  latitud!: number;

  @ApiProperty()
  longitud!: number;

  @ApiProperty({ enum: EstadoParada })
  estadoParada!: EstadoParada;

  @ApiProperty({ description: "Capacidad de pasajeros esperando en la parada" })
  capacidadPasajeros!: number;

  // Derived from tbl_estacion (1:1 extension of a parada); read-only. An
  // estación is still created/removed through /infrastructure/estaciones.
  @ApiProperty({
    description: "Indica si la parada tiene una estación asociada",
  })
  esEstacion!: boolean;

  @ApiProperty({
    description: "ID de la estación asociada, o null si la parada no es estación",
    type: Number,
    nullable: true,
  })
  idEstacion!: number | null;
}
