import { IsInt, IsOptional, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

// The parada itself cannot be changed; remove and re-add instead.
export class UpdateLineaParadaDto {
  @ApiPropertyOptional({
    description: "Nueva posición en la secuencia (>0, única por línea)",
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  orden?: number;

  @ApiPropertyOptional({
    description: "Minutos hasta la siguiente parada (>=0)",
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  minutosHastaSiguiente?: number;
}
