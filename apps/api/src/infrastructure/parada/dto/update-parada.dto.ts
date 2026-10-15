import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsInt, Min, ValidateIf } from "class-validator";

import { CreateParadaDto } from "./create-parada.dto.js";

export class UpdateParadaDto extends PartialType(CreateParadaDto) {
  // PartialType marks every field IsOptional, which lets null through; the
  // column is NOT NULL, so only an absent value skips validation (400 on null).
  @ApiPropertyOptional({ description: "Capacidad de pasajeros esperando en la parada", minimum: 1 })
  @ValidateIf((o: { capacidadPasajeros?: unknown }) => o.capacidadPasajeros !== undefined)
  @IsInt()
  @Min(1)
  override capacidadPasajeros?: number;
}
