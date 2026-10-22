import { IsString, IsNotEmpty, IsEnum, IsISO8601, IsOptional, Matches, ValidateIf } from "class-validator";
import { Transform } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { AccionAfectacion } from "../afectacion.entity.js";
import { DATE_MESSAGE, DATE_ONLY } from "./create-afectacion.dto.js";

const present = (_: object, value: unknown) => value !== undefined;

/**
 * Edits an afectación. The target is fixed: target ids are not part of this
 * DTO, so the whitelist ValidationPipe strips them. Changing `accion` applies
 * it (see AfectacionService.update); omitted fields keep their value.
 */
export class UpdateAfectacionDto {
  @ApiPropertyOptional({
    description: "Nueva acción; solo la afectación más reciente del objetivo puede cambiarla",
    enum: AccionAfectacion,
  })
  @ValidateIf(present)
  @IsEnum(AccionAfectacion)
  accion?: AccionAfectacion;

  @ApiPropertyOptional({ description: "Motivo de la afectación" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf(present)
  @IsString()
  @IsNotEmpty()
  motivo?: string;

  @ApiPropertyOptional({ description: "Fecha de inicio (YYYY-MM-DD)", example: "2026-10-21" })
  @ValidateIf(present)
  @Matches(DATE_ONLY, { message: `fechaInicio ${DATE_MESSAGE}` })
  @IsISO8601({ strict: true })
  fechaInicio?: string;

  @ApiPropertyOptional({
    description: "Fecha de fin (YYYY-MM-DD), solo informativa; null la borra",
    example: "2026-10-25",
    nullable: true,
    type: String,
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: `fechaFin ${DATE_MESSAGE}` })
  @IsISO8601({ strict: true })
  fechaFin?: string | null;
}
