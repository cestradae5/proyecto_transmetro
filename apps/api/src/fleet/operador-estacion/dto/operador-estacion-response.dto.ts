import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// Minimal station-operator summary for the assignment UI: no email or role data.
export class OperadorEstacionResponseDto {
  @ApiProperty({ description: "ID del empleado operador" })
  idEmpleado!: string;

  @ApiProperty({ description: "Nombre del operador" })
  nombre!: string;

  @ApiPropertyOptional({
    description: "ID de la estación con asignación ACTIVA; omitido si no tiene",
  })
  idEstacionActual?: string;
}
