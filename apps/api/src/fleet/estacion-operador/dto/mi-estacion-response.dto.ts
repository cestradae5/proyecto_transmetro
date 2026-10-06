// Response contract of GET /fleet/my-station. Plain interfaces: the payload is
// composed from read-only queries and never validated as input.

export interface MiEstacionParadaDto {
  idParada: string;
  nombreParada: string;
}

export interface MiEstacionStationDto {
  idEstacion: string;
  nombreEstacion: string;
  estadoEstacion: string;
  latitud: number;
  longitud: number;
  parada?: MiEstacionParadaDto;
}

export interface MiEstacionLineStopDto {
  idLineaParada: string;
  orden: number;
  idParada: string;
  nombreParada: string;
  // True when this stop is the physical stop the station sits on.
  isStationStop: boolean;
}

export interface MiEstacionLineDto {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
  colorHex: string;
  estadoLinea: string;
  tipoPunto: string;
  stops: MiEstacionLineStopDto[];
}

export interface MiEstacionUnitDto {
  idUnidad: string;
  numeroPlaca: string;
  estadoUnidad: string;
  idLinea: string;
  idLineaParadaActual?: string;
  nombreParadaActual?: string;
  fechaReporteUbicacion?: Date;
  pilotAssigned: boolean;
  nombrePiloto?: string;
}

export interface MiEstacionResponseDto {
  station: MiEstacionStationDto;
  lines: MiEstacionLineDto[];
  units: MiEstacionUnitDto[];
}
