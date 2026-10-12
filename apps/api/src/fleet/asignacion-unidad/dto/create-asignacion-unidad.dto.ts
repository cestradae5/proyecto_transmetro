import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

// bigint-as-string convention (design.md Decision 7), matching
// LineaEntity.idLinea/LineaEntity.idParqueo.
export class CreateAsignacionUnidadDto {
  @ApiProperty({ description: "ID de la línea a asignar" })
  @IsString()
  @IsNotEmpty()
  idLinea!: string;
}
