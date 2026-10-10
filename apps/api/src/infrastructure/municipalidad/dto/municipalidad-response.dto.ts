import { ApiProperty } from "@nestjs/swagger";
import { EstadoMunicipalidad } from "../municipalidad.entity.js";

export class MunicipalidadResponseDto {
  @ApiProperty({ description: "ID de la municipalidad" })
  idMunicipalidad!: string;

  @ApiProperty({ description: "Nombre de la municipalidad" })
  nombreMunicipalidad!: string;

  @ApiProperty({ description: "Departamento" })
  departamento!: string;

  @ApiProperty({
    description: "Estado de la municipalidad",
    enum: EstadoMunicipalidad,
  })
  estadoMunicipalidad!: EstadoMunicipalidad;
}
