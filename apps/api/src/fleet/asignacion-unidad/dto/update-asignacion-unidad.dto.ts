import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

// Reassign payload — not PartialType(CreateAsignacionUnidadDto): idLinea is
// always required for a reassign (there is nothing else to change).
export class UpdateAsignacionUnidadDto {
  @ApiProperty({ description: "ID de la nueva línea" })
  @IsString()
  @IsNotEmpty()
  idLinea!: string;
}
