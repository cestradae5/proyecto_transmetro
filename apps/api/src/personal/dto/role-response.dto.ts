import { ApiProperty } from "@nestjs/swagger";

export class RoleResponseDto {
  @ApiProperty({ example: "2" })
  id!: string;

  @ApiProperty({ example: "PILOTO" })
  code!: string;

  @ApiProperty({ example: "Piloto" })
  name!: string;
}
