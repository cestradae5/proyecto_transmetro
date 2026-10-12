import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateLineaMunicipalidadDto {
  @ApiProperty({ description: "ID de la municipalidad a vincular" })
  @IsString()
  @IsNotEmpty()
  idMunicipalidad!: string;
}

export class LineaMunicipalidadResponseDto {
  @ApiProperty() idLinea!: string;
  @ApiProperty() idMunicipalidad!: string;
  @ApiPropertyOptional() nombreMunicipalidad?: string;
}
