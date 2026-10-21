import { ApiProperty } from "@nestjs/swagger";
import { AccionAfectacion } from "../afectacion.entity.js";

export class AfectacionCambioDto {
  @ApiProperty({ description: "Tipo de registro cambiado", enum: ["municipalidad", "linea", "parada", "estacion"] })
  entidadTipo!: string;

  @ApiProperty({ description: "ID del registro cambiado" })
  entidadId!: string;

  @ApiProperty({ description: "Estado antes del cambio" })
  estadoAnterior!: string;

  @ApiProperty({ description: "Estado que dejó el cambio" })
  estadoNuevo!: string;

  @ApiProperty({ description: "true cuando el cambio ya no está vigente (revertido o reemplazado)" })
  revertido!: boolean;
}

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

  @ApiProperty({ description: "ID de la municipalidad afectada", nullable: true, type: String })
  idMunicipalidad!: string | null;

  @ApiProperty({ description: "ID de la línea afectada", nullable: true, type: String })
  idLinea!: string | null;

  @ApiProperty({ description: "ID de la parada afectada", nullable: true, type: String })
  idParada!: string | null;

  @ApiProperty({ description: "ID de la estación afectada", nullable: true, type: String })
  idEstacion!: string | null;

  @ApiProperty({
    description: "Cambios de estado de la afectación (objetivo y cascada), del más antiguo al más reciente",
    type: [AfectacionCambioDto],
  })
  cambios!: AfectacionCambioDto[];
}
