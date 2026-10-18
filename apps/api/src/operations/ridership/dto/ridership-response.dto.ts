import { ApiProperty } from "@nestjs/swagger";

// Ids are strings and dates ISO 8601, like the alerts module.

// Counts are per parada; a station uses its parada's (parada-ridership S2).
export class ParadaOccupancyDto {
  @ApiProperty() idParada!: string;
  @ApiProperty() nombreParada!: string;
  @ApiProperty({ type: String, nullable: true, description: "Estación de la parada, o null si no es estación" })
  idEstacion!: string | null;
  @ApiProperty() capacidadPasajeros!: number;
  @ApiProperty({ description: "Estimación: entradas menos quienes abordaron" }) personasEnParada!: number;
  @ApiProperty({ description: "Porcentaje de la capacidad, redondeado" }) porcentaje!: number;
  @ApiProperty({ description: "Hay una alerta de capacidad que no está RESUELTA" }) alertaActiva!: boolean;
}

export class TurnstilePassResponseDto {
  @ApiProperty() idEvento!: string;
  @ApiProperty({ enum: ["ENTRADA", "SALIDA"] }) tipo!: string;
  @ApiProperty() numeroTarjeta!: string;
  @ApiProperty({ description: "Monto cobrado en GTQ (0 en SALIDA)" }) montoCobrado!: number;
  @ApiProperty({ description: "Saldo restante en GTQ" }) saldo!: number;
  @ApiProperty({ type: ParadaOccupancyDto }) parada!: ParadaOccupancyDto;
  @ApiProperty({ description: "Esta pasada generó la alerta de capacidad" }) alertaGenerada!: boolean;
  @ApiProperty({ type: String, nullable: true }) idAlerta!: string | null;
  @ApiProperty({ description: "La pasada ya se había registrado con la misma idempotencyKey" })
  repetido!: boolean;
}

// One pilot report at a parada (bus-passenger-report S3, S7).
export class StopReportDto {
  @ApiProperty() idParadaUnidad!: string;
  @ApiProperty() idParada!: string;
  @ApiProperty() nombreParada!: string;
  @ApiProperty() bajaron!: number;
  @ApiProperty() subieron!: number;
  @ApiProperty({ description: "Pasajeros a bordo después del reporte" }) aBordo!: number;
  @ApiProperty() porcentaje!: number;
  @ApiProperty({ description: "5 si la unidad quedó bajo el 25% de su capacidad" }) minutosEsperaExtra!: number;
  @ApiProperty({ description: "ISO 8601" }) fecha!: string;
}

export class UnitOccupancyDto {
  @ApiProperty() idUnidad!: string;
  @ApiProperty() numeroPlaca!: string;
  @ApiProperty() capacidadPasajeros!: number;
  @ApiProperty({ description: "Pasajeros a bordo según el último reporte (0 sin reportes)" }) aBordo!: number;
  @ApiProperty() porcentaje!: number;
  @ApiProperty({ type: StopReportDto, nullable: true }) ultimoReporte!: StopReportDto | null;
}

export class CapacityAlertParadaDto {
  @ApiProperty() idParada!: string;
  @ApiProperty() nombreParada!: string;
  @ApiProperty({ type: String, nullable: true }) idEstacion!: string | null;
}

export class CapacityAlertDto {
  @ApiProperty() idAlerta!: string;
  @ApiProperty() estadoAlerta!: string;
  @ApiProperty({ description: "ISO 8601" }) fechaCreacion!: string;
  @ApiProperty({ description: "ISO 8601" }) fechaActualizacion!: string;
  @ApiProperty({ type: CapacityAlertParadaDto }) parada!: CapacityAlertParadaDto;
}
