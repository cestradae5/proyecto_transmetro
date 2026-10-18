import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

import { TURNSTILE_EVENT_TYPES, type TurnstileEventType } from "../ridership.constants.js";

// S4: what the turnstile reports. Never the balance: the server reads it.
export class TurnstilePassDto {
  @ApiProperty({ description: "Número de la tarjeta ciudadana", maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  numeroTarjeta!: string;

  @ApiProperty({ description: "Estación de la talanquera", minimum: 1 })
  @IsInt()
  @Min(1)
  idEstacion!: number;

  @ApiProperty({ enum: TURNSTILE_EVENT_TYPES })
  @IsIn(TURNSTILE_EVENT_TYPES)
  tipo!: TurnstileEventType;
}

// S8: the station where the bus stops.
export class UnitArrivalDto {
  @ApiProperty({ description: "Estación donde se detiene la unidad", minimum: 1 })
  @IsInt()
  @Min(1)
  idEstacion!: number;
}
