import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsString, Matches } from "class-validator";

import { TIPOS_ALERTA_UNIDAD, type TipoAlertaUnidad } from "../alerta.constants.js";

// The unit and the author are derived server side from the caller's pilot
// assignment; the pilot only picks the type and a station of their line.
export class CreateAlertaDto {
  @ApiProperty({ enum: TIPOS_ALERTA_UNIDAD, description: "Tipo de alerta predefinido" })
  @IsIn(TIPOS_ALERTA_UNIDAD)
  tipoAlerta!: TipoAlertaUnidad;

  @ApiProperty({ description: "ID de la estación de destino (de la línea de la unidad)" })
  @IsString()
  @Matches(/^\d+$/, { message: "idEstacionDestino must be a numeric id" })
  idEstacionDestino!: string;
}
