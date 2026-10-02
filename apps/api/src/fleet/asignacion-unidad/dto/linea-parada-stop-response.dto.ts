import { ApiProperty } from "@nestjs/swagger";

// One stop of a unit's assigned line, in route order. `idLineaParada` is the
// line-stop junction id (the value POST .../location expects), `idParada` the
// stop id itself. Ids are strings like every other API id (bigint columns).
export class LineaParadaStopResponseDto {
  @ApiProperty({ description: "ID del registro línea-parada (usado al reportar ubicación)" })
  idLineaParada!: string;

  @ApiProperty({ description: "ID de la parada" })
  idParada!: string;

  @ApiProperty({ description: "Nombre de la parada" })
  nombre!: string;

  @ApiProperty({ description: "Posición de la parada en el recorrido de la línea" })
  orden!: number;
}
