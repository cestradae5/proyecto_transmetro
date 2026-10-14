import { ApiProperty } from "@nestjs/swagger";

export class AlertaUnidadDto {
  @ApiProperty() idUnidad!: string;
  @ApiProperty() numeroPlaca!: string;
}

export class AlertaEstacionDto {
  @ApiProperty() idEstacion!: string;
  @ApiProperty() nombreEstacion!: string;
}

export class AlertaAutorDto {
  @ApiProperty() idEmpleado!: string;
  @ApiProperty() nombre!: string;
}

export class AlertaResponseDto {
  @ApiProperty() idAlerta!: string;
  @ApiProperty() tipoAlerta!: string;
  @ApiProperty() tipoOrigen!: string;
  @ApiProperty() tipoDestino!: string;
  @ApiProperty() estadoAlerta!: string;
  @ApiProperty({ description: "ISO 8601" }) fechaCreacion!: string;
  @ApiProperty({ description: "ISO 8601" }) fechaActualizacion!: string;
  @ApiProperty({ type: AlertaUnidadDto }) unidad!: AlertaUnidadDto;
  @ApiProperty({ type: AlertaEstacionDto }) estacionDestino!: AlertaEstacionDto;
  @ApiProperty({ type: AlertaAutorDto }) autor!: AlertaAutorDto;
}

export class AlertaDestinationDto {
  @ApiProperty() idEstacion!: string;
  @ApiProperty() nombreEstacion!: string;
  @ApiProperty({ nullable: true, type: Number, description: "Orden de la parada de la estación en la línea" })
  orden!: number | null;
  @ApiProperty({ description: "Estación más cercana a la última parada reportada" })
  suggested!: boolean;
}

export class AlertaLineaDto {
  @ApiProperty() idLinea!: string;
  @ApiProperty() numeroLinea!: string;
  @ApiProperty() nombreLinea!: string;
}

export class AlertaDestinationsResponseDto {
  @ApiProperty({ type: AlertaUnidadDto }) unidad!: AlertaUnidadDto;
  @ApiProperty({ type: AlertaLineaDto }) linea!: AlertaLineaDto;
  @ApiProperty({ type: [AlertaDestinationDto] }) destinations!: AlertaDestinationDto[];
}

export class StationAlertsResponseDto {
  @ApiProperty({ type: AlertaEstacionDto }) station!: AlertaEstacionDto;
  @ApiProperty({ type: [AlertaResponseDto] }) alerts!: AlertaResponseDto[];
}
