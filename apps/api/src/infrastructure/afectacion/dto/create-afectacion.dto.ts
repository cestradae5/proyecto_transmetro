import {
  IsString,
  IsNumberString,
  IsNotEmpty,
  IsEnum,
  IsDateString,
  IsOptional,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AccionAfectacion } from "../afectacion.entity.js";

export { AccionAfectacion };

/**
 * Activates or deactivates exactly one línea, parada or estación. The
 * "exactly one target" rule is enforced by AfectacionService.
 */
export class CreateAfectacionDto {
  @ApiProperty({ description: "Acción a aplicar", enum: AccionAfectacion })
  @IsEnum(AccionAfectacion)
  accion!: AccionAfectacion;

  @ApiProperty({ description: "Motivo de la afectación" })
  @IsString()
  @IsNotEmpty()
  motivo!: string;

  @ApiProperty({ description: "Fecha de inicio (YYYY-MM-DD)", example: "2026-10-21" })
  @IsDateString()
  fechaInicio!: string;

  @ApiPropertyOptional({
    description: "Fecha de fin (YYYY-MM-DD), solo informativa",
    example: "2026-10-25",
  })
  @IsOptional()
  @IsDateString()
  fechaFin?: string;

  @ApiPropertyOptional({ description: "ID de la línea (uno solo de idLinea, idParada, idEstacion)" })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  idLinea?: string;

  @ApiPropertyOptional({ description: "ID de la parada (uno solo de idLinea, idParada, idEstacion)" })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  idParada?: string;

  @ApiPropertyOptional({ description: "ID de la estación (uno solo de idLinea, idParada, idEstacion)" })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  idEstacion?: string;
}
