import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AsignacionEstacionLineaDto {
  @ApiProperty() idLinea!: string;
  @ApiProperty() numeroLinea!: string;
  @ApiProperty() nombreLinea!: string;
}

export class AsignacionEstacionResponseDto {
  @ApiProperty({ description: "ID de la asignación" })
  idAsignacionEstacion!: string;

  @ApiProperty({ description: "ID del empleado operador" })
  idEmpleado!: string;

  @ApiProperty({ description: "Nombre del empleado operador" })
  nombreEmpleado!: string;

  @ApiProperty({ description: "ID de la estación" })
  idEstacion!: string;

  @ApiProperty({ description: "Nombre de la estación" })
  nombreEstacion!: string;

  @ApiProperty({ description: "Estado de la asignación (ACTIVA | INACTIVA)" })
  estadoAsignacion!: string;

  @ApiProperty({ description: "Fecha de asignación" })
  fechaAsignacion!: Date;

  @ApiPropertyOptional({
    type: [AsignacionEstacionLineaDto],
    description:
      "Líneas ACTIVAS de la estación (las que atiende el operador). Solo en el listado; se gestionan en Infraestructura",
  })
  lineas?: AsignacionEstacionLineaDto[];
}
