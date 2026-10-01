import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

// idLineaParada references tbl_linea_parada.id_linea_parada (a specific
// stop position within a line's sequence), not tbl_parada directly.
export class ReportLocationDto {
  @ApiProperty({ description: "ID de la parada de línea (tbl_linea_parada) reportada" })
  @IsString()
  @IsNotEmpty()
  idLineaParada!: string;
}
