import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// Response shape per task 4.2.2: "pilot identifier (id, nombre if
// available) + unit context for convenience". nombreEmpleado is populated
// from EmployeeEntity.name when the lookup succeeds (always true in
// practice, since the employee was just validated), optional in the DTO so
// the shape degrades gracefully if that secondary read ever returns
// nothing.
export class AsignacionPilotoResponseDto {
  @ApiProperty({ description: "ID de la asignación" })
  id!: string;

  @ApiProperty({ description: "ID del empleado piloto" })
  idEmpleado!: string;

  @ApiPropertyOptional({ description: "Nombre del empleado piloto, si está disponible" })
  nombreEmpleado?: string;

  @ApiProperty({ description: "ID de la unidad" })
  idUnidad!: string;

  @ApiProperty({ description: "Fecha en que se creó la asignación" })
  fechaAsignacion!: Date;

  @ApiProperty({ description: "Fecha de última actualización de la asignación" })
  fechaActualizacion!: Date;
}
