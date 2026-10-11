import { IsArray, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ReorderLineaParadasDto {
  @ApiProperty({
    description:
      "IDs de tbl_linea_parada en el nuevo orden (lista completa de la línea, sin repetidos; la posición i recibe orden i + 1)",
    type: [String],
    example: ["12", "10", "11"],
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  idsLineaParada!: string[];
}
