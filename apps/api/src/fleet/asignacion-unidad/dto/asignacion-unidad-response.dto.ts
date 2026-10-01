import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AsignacionUnidadResponseDto {
  @ApiProperty({ description: "ID de la asignación" })
  id!: string;

  @ApiProperty({ description: "ID de la unidad" })
  idUnidad!: string;

  @ApiProperty({ description: "ID de la línea asignada" })
  idLinea!: string;

  @ApiProperty({ description: "Fecha en que se creó la asignación" })
  fechaAsignacion!: Date;

  @ApiProperty({ description: "Fecha de última actualización de la asignación" })
  fechaActualizacion!: Date;

  @ApiPropertyOptional({ description: "ID de la última parada de línea reportada (si existe)" })
  idLineaParadaActual?: string;

  @ApiPropertyOptional({ description: "Fecha del último reporte de ubicación" })
  fechaReporteUbicacion?: Date;
}
