import { ApiProperty } from "@nestjs/swagger";

// Ids are strings and dates ISO 8601, like the alerts module.

export class StationOccupancyDto {
  @ApiProperty() idEstacion!: string;
  @ApiProperty() nombreEstacion!: string;
  @ApiProperty() capacidadPasajeros!: number;
  @ApiProperty({ description: "Estimación: entradas menos quienes abordaron" }) personasEnEstacion!: number;
  @ApiProperty({ description: "Porcentaje de la capacidad, redondeado" }) porcentaje!: number;
  @ApiProperty({ description: "Hay una alerta de capacidad que no está RESUELTA" }) alertaActiva!: boolean;
}

export class TurnstilePassResponseDto {
  @ApiProperty() idEvento!: string;
  @ApiProperty({ enum: ["ENTRADA", "SALIDA"] }) tipo!: string;
  @ApiProperty() numeroTarjeta!: string;
  @ApiProperty({ description: "Monto cobrado en GTQ (0 en SALIDA)" }) montoCobrado!: number;
  @ApiProperty({ description: "Saldo restante en GTQ" }) saldo!: number;
  @ApiProperty({ type: StationOccupancyDto }) estacion!: StationOccupancyDto;
  @ApiProperty({ description: "Esta pasada generó la alerta de capacidad" }) alertaGenerada!: boolean;
  @ApiProperty({ type: String, nullable: true }) idAlerta!: string | null;
  @ApiProperty({ description: "La pasada ya se había registrado con la misma idempotencyKey" })
  repetido!: boolean;
}

export class UnitStopDto {
  @ApiProperty() idParadaUnidad!: string;
  @ApiProperty() idUnidad!: string;
  @ApiProperty() numeroPlaca!: string;
  @ApiProperty() capacidadPasajeros!: number;
  @ApiProperty() idEstacion!: string;
  @ApiProperty() nombreEstacion!: string;
  @ApiProperty({ description: "Pasajeros a bordo al llegar" }) ocupacionLlegada!: number;
  @ApiProperty() subieron!: number;
  @ApiProperty() bajaron!: number;
  @ApiProperty({ description: "Estimación de pasajeros a bordo" }) ocupacionEstimada!: number;
  @ApiProperty() porcentaje!: number;
  @ApiProperty({ description: "5 si la unidad quedó bajo el 25% de su capacidad" }) minutosEsperaExtra!: number;
  @ApiProperty({ description: "ISO 8601" }) fechaLlegada!: string;
  @ApiProperty({ type: String, nullable: true, description: "ISO 8601; null mientras sigue detenida" })
  fechaSalida!: string | null;
}

export class UnitOccupancyDto {
  @ApiProperty() idUnidad!: string;
  @ApiProperty() numeroPlaca!: string;
  @ApiProperty() capacidadPasajeros!: number;
  @ApiProperty() ocupacionEstimada!: number;
  @ApiProperty() porcentaje!: number;
  @ApiProperty({ type: UnitStopDto, nullable: true }) paradaAbierta!: UnitStopDto | null;
}

export class CapacityAlertStationDto {
  @ApiProperty() idEstacion!: string;
  @ApiProperty() nombreEstacion!: string;
}

export class CapacityAlertDto {
  @ApiProperty() idAlerta!: string;
  @ApiProperty() estadoAlerta!: string;
  @ApiProperty({ description: "ISO 8601" }) fechaCreacion!: string;
  @ApiProperty({ description: "ISO 8601" }) fechaActualizacion!: string;
  @ApiProperty({ type: CapacityAlertStationDto }) estacion!: CapacityAlertStationDto;
}
