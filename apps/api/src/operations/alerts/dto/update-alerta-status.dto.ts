import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

import { ESTADOS_ALERTA_DESTINO, type EstadoAlertaDestino } from "../alerta.constants.js";

export class UpdateAlertaStatusDto {
  @ApiProperty({ enum: ESTADOS_ALERTA_DESTINO, description: "Nuevo estado (solo hacia adelante)" })
  @IsIn(ESTADOS_ALERTA_DESTINO)
  estado!: EstadoAlertaDestino;

  @ApiPropertyOptional({ description: "Observación del cambio de estado", maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacion?: string;
}
