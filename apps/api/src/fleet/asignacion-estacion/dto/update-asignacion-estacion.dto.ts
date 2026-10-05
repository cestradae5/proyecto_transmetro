import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class UpdateAsignacionEstacionDto {
  @ApiProperty({ description: "ID de la nueva estación" })
  @IsString()
  @IsNotEmpty()
  idEstacion!: string;
}
