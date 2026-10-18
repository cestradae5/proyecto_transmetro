import { ApiProperty } from "@nestjs/swagger";
import { IsNumber, IsString, Matches, Max, Min } from "class-validator";

export const RECHARGE_MIN = 1;
export const RECHARGE_MAX = 500;

// S5: amount in GTQ and a client-generated reference that makes retries safe.
export class CreateRechargeDto {
  @ApiProperty({ description: "Monto en GTQ, 1.00 a 500.00, máximo 2 decimales", minimum: 1, maximum: 500 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(RECHARGE_MIN)
  @Max(RECHARGE_MAX)
  monto!: number;

  @ApiProperty({ description: "Referencia del intento: 8-100 caracteres [A-Za-z0-9-]", pattern: "^[A-Za-z0-9-]{8,100}$" })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,100}$/)
  referencia!: string;
}

export class CitizenCardDto {
  @ApiProperty() numeroTarjeta!: string;
  @ApiProperty({ description: "Saldo en GTQ" }) saldo!: number;
  @ApiProperty({ enum: ["ACTIVA", "BLOQUEADA", "VENCIDA", "ANULADA"] }) estadoTarjeta!: string;
}

export class CitizenLineStopDto {
  @ApiProperty() idParada!: string;
  @ApiProperty() nombreParada!: string;
  @ApiProperty({ type: Number, nullable: true, description: "Orden en la ruta; null en 'Sin línea'" }) orden!: number | null;
  @ApiProperty({ description: "La parada también es estación" }) esEstacion!: boolean;
}

export class CitizenLineDto {
  @ApiProperty({ type: String, nullable: true, description: "null para el grupo 'Sin línea'" }) idLinea!: string | null;
  @ApiProperty({ type: String, nullable: true }) numeroLinea!: string | null;
  @ApiProperty() nombreLinea!: string;
  @ApiProperty({ type: [CitizenLineStopDto] }) paradas!: CitizenLineStopDto[];
}

export class RechargeResponseDto {
  @ApiProperty() idRecarga!: string;
  @ApiProperty() numeroComprobante!: string;
  @ApiProperty({ description: "Monto recargado en GTQ" }) monto!: number;
  @ApiProperty({ description: "Saldo actual en GTQ" }) saldo!: number;
  @ApiProperty({ description: "ISO 8601" }) fechaRecarga!: string;
  @ApiProperty({ description: "La recarga ya existía con la misma referencia" }) repetida!: boolean;
}
