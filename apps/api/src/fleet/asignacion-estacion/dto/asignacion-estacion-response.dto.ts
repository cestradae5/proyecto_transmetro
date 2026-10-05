import { ApiProperty } from "@nestjs/swagger";

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
}
