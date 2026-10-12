import { ApiProperty } from "@nestjs/swagger";

import { EstadoAcceso, TipoAcceso } from "../acceso.entity.js";

export class AccesoResponseDto {
  @ApiProperty({ description: "ID del acceso" })
  idAcceso!: string;

  @ApiProperty({ description: "ID de la parada a la que pertenece" })
  idParada!: string;

  @ApiProperty({ description: "Nombre del acceso" })
  nombreAcceso!: string;

  @ApiProperty()
  latitud!: number;

  @ApiProperty()
  longitud!: number;

  @ApiProperty({ enum: TipoAcceso })
  tipoAcceso!: TipoAcceso;

  @ApiProperty({ enum: EstadoAcceso })
  estadoAcceso!: EstadoAcceso;
}
