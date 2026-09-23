import { ApiProperty } from "@nestjs/swagger";

import { EstadoParada } from "../parada.entity.js";

export class ParadaResponseDto {
  @ApiProperty()
  idParada!: string;

  @ApiProperty()
  nombreParada!: string;

  @ApiProperty()
  latitud!: number;

  @ApiProperty()
  longitud!: number;

  @ApiProperty({ enum: EstadoParada })
  estadoParada!: EstadoParada;
}
