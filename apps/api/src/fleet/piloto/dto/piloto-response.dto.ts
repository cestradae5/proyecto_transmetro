import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// Eligible pilot summary for the operator UI. Deliberately minimal: never
// includes email, role details or any other employee field.
export class PilotoResponseDto {
  @ApiProperty({ description: "ID del empleado piloto" })
  idEmpleado!: string;

  @ApiProperty({ description: "Nombre del piloto" })
  nombre!: string;

  @ApiPropertyOptional({
    description: "ID de la unidad actualmente asignada al piloto; omitido si no tiene asignación",
  })
  idUnidad?: string;
}
