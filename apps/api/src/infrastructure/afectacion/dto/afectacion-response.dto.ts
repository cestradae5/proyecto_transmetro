import { ApiProperty } from "@nestjs/swagger";
import { AccionAfectacion } from "../afectacion.entity.js";

export class AfectacionResponseDto {
  @ApiProperty({ description: "ID de la afectación" })
  idAfectacion!: string;

  @ApiProperty({
    description: "Acción aplicada (filas anteriores pueden traer su tipo original)",
    enum: AccionAfectacion,
  })
  accion!: string;

  @ApiProperty({ description: "Motivo de la afectación" })
  motivo!: string;

  @ApiProperty({ description: "Fecha de inicio" })
  fechaInicio!: Date | string;

  @ApiProperty({ description: "Fecha de fin (informativa)", nullable: true, type: String })
  fechaFin!: Date | string | null;

  @ApiProperty({ description: "ID de la línea afectada", nullable: true, type: String })
  idLinea!: string | null;

  @ApiProperty({ description: "ID de la parada afectada", nullable: true, type: String })
  idParada!: string | null;

  @ApiProperty({ description: "ID de la estación afectada", nullable: true, type: String })
  idEstacion!: string | null;
}
