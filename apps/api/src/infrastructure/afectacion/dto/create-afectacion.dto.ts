import {
  IsString,
  IsNumberString,
  IsNotEmpty,
  IsEnum,
  IsISO8601,
  IsOptional,
  Matches,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AccionAfectacion } from "../afectacion.entity.js";

export { AccionAfectacion };

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const DATE_MESSAGE = "must be a date in YYYY-MM-DD format";

/**
 * Activates or deactivates exactly one municipalidad, línea, parada or
 * estación. The "exactly one target" rule is enforced by AfectacionService.
 */
export class CreateAfectacionDto {
  @ApiProperty({ description: "Acción a aplicar", enum: AccionAfectacion })
  @IsEnum(AccionAfectacion)
  accion!: AccionAfectacion;

  @ApiProperty({ description: "Motivo de la afectación" })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  motivo!: string;

  @ApiProperty({ description: "Fecha de inicio (YYYY-MM-DD)", example: "2026-10-21" })
  @Matches(DATE_ONLY, { message: `fechaInicio ${DATE_MESSAGE}` })
  @IsISO8601({ strict: true })
  fechaInicio!: string;

  @ApiPropertyOptional({
    description: "Fecha de fin (YYYY-MM-DD), solo informativa",
    example: "2026-10-25",
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: `fechaFin ${DATE_MESSAGE}` })
  @IsISO8601({ strict: true })
  fechaFin?: string;

  @ApiPropertyOptional({
    description: "ID de la municipalidad (uno solo de idMunicipalidad, idLinea, idParada, idEstacion)",
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  idMunicipalidad?: string;

  @ApiPropertyOptional({ description: "ID de la línea (uno solo de idMunicipalidad, idLinea, idParada, idEstacion)" })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  idLinea?: string;

  @ApiPropertyOptional({ description: "ID de la parada (uno solo de idMunicipalidad, idLinea, idParada, idEstacion)" })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  idParada?: string;

  @ApiPropertyOptional({ description: "ID de la estación (uno solo de idMunicipalidad, idLinea, idParada, idEstacion)" })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  idEstacion?: string;
}
