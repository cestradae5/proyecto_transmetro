import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

// Reassign payload — not PartialType(CreateAsignacionPilotoDto): idEmpleado
// is always required. Per spec.md "Reassign Pilot to a Different Unit", the
// URL's :unitId is the TARGET unit; idEmpleado names the pilot being moved
// from their current unit to it. This is NOT the same shape-pattern as
// UpdateAsignacionUnidadDto (which replaces the SAME unit's line) — see
// asignacion-piloto.service.ts's module comment for the full reasoning.
export class UpdateAsignacionPilotoDto {
  @ApiProperty({ description: "ID del empleado piloto a reasignar a esta unidad" })
  @IsString()
  @IsNotEmpty()
  idEmpleado!: string;
}
