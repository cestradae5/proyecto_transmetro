import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

// bigint-as-string convention, same as CreateAsignacionPilotoDto.
export class CreateAsignacionEstacionDto {
  @ApiProperty({ description: "ID del empleado operador de estación" })
  @IsString()
  @IsNotEmpty()
  idEmpleado!: string;

  @ApiProperty({ description: "ID de la estación" })
  @IsString()
  @IsNotEmpty()
  idEstacion!: string;
}
