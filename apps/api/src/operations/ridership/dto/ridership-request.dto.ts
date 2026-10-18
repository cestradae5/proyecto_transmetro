import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";

import { TURNSTILE_EVENT_TYPES, type TurnstileEventType } from "../ridership.constants.js";

// S4: what the turnstile reports. Never the balance: the server reads it.
export class TurnstilePassDto {
  @ApiProperty({ description: "Número de la tarjeta ciudadana", maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numeroTarjeta!: string;

  @ApiProperty({ description: "Parada de la talanquera (sea o no estación)", minimum: 1 })
  @IsInt()
  @Min(1)
  idParada!: number;

  @ApiProperty({ enum: TURNSTILE_EVENT_TYPES })
  @IsIn(TURNSTILE_EVENT_TYPES)
  tipo!: TurnstileEventType;

  // A retry with the same key returns the original pass (no new charge).
  @ApiPropertyOptional({
    description: "Clave para reintentos seguros: 8-64 caracteres [A-Za-z0-9-]",
    pattern: "^[A-Za-z0-9-]{8,64}$",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/)
  idempotencyKey?: string;
}

// S8: the parada where the bus stops.
export class UnitArrivalDto {
  @ApiProperty({ description: "Parada donde se detiene la unidad", minimum: 1 })
  @IsInt()
  @Min(1)
  idParada!: number;
}
