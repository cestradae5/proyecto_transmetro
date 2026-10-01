import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

// bigint-as-string convention (design.md Decision 7), matching
// CreateAsignacionUnidadDto.idLinea.
export class CreateAsignacionPilotoDto {
  @ApiProperty({ description: "ID del empleado piloto a asignar" })
  @IsString()
  @IsNotEmpty()
  idEmpleado!: string;
}
