import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export const CARDS_PAGE_SIZE = 20;
export const ACTIVITY_LIMIT = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

// odd/tasks/card-activity.md S3.
export class QueryCardsDto {
  @ApiPropertyOptional({ description: "Parte del número de tarjeta (sin distinguir mayúsculas)", maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class CardSummaryDto {
  @ApiProperty() numeroTarjeta!: string;
  @ApiProperty({ description: "Saldo en GTQ" }) saldo!: number;
  @ApiProperty({ enum: ["ACTIVA", "BLOQUEADA", "VENCIDA", "ANULADA"] }) estadoTarjeta!: string;
}

export class CardPageDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty({ type: [CardSummaryDto] }) items!: CardSummaryDto[];
}

export class CardPassParadaDto {
  @ApiProperty() idParada!: string;
  @ApiProperty() nombreParada!: string;
  @ApiProperty({ description: "La parada también es estación" }) esEstacion!: boolean;
}

export class CardPassDto {
  @ApiProperty() idEvento!: string;
  @ApiProperty({ enum: ["ENTRADA", "SALIDA"] }) tipo!: string;
  @ApiProperty({ description: "GTQ cobrados (0 en salidas)" }) montoCobrado!: number;
  @ApiProperty({ type: CardPassParadaDto }) parada!: CardPassParadaDto;
  @ApiProperty({ description: "ISO 8601" }) fecha!: string;
}

export class CardPaymentDto {
  @ApiProperty() idTransaccion!: string;
  @ApiProperty() referencia!: string;
  @ApiProperty({ description: "GTQ" }) monto!: number;
  @ApiProperty() estadoPago!: string;
  @ApiProperty({ enum: ["SIMULADA", "QPAYPRO"] }) origen!: string;
  @ApiProperty({ type: String, nullable: true, description: "Comprobante de la recarga aprobada" })
  numeroComprobante!: string | null;
  @ApiProperty({ description: "ISO 8601" }) fecha!: string;
}

export class CardActivityDto {
  @ApiProperty({ type: CardSummaryDto }) tarjeta!: CardSummaryDto;
  @ApiProperty({ type: [CardPassDto], description: "Más recientes primero, máximo 100" }) pasadas!: CardPassDto[];
  @ApiProperty({ type: [CardPaymentDto], description: "Más recientes primero, máximo 100" }) recargas!: CardPaymentDto[];
}
