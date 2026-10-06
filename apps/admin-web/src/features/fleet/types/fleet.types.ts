import type { Parqueo } from '../../infrastructure/types/infrastructure.types';

export enum EstadoUnidad {
  DISPONIBLE = 'DISPONIBLE',
  EN_SERVICIO = 'EN_SERVICIO',
  MANTENIMIENTO = 'MANTENIMIENTO',
  FUERA_DE_SERVICIO = 'FUERA_DE_SERVICIO',
}

export interface Unidad {
  idUnidad: string;
  numeroPlaca: string;
  marca: string;
  modelo: string;
  anio: number;
  capacidadPasajeros: number;
  estadoUnidad: EstadoUnidad;
  fechaRegistro: string;
  fechaActualizacion: string;
  idLinea?: string | null;
  /** Name of the assigned line; present whenever the unit has a line. */
  nombreLinea?: string;
  parqueo?: Parqueo | null;
  idEmpleadoPiloto?: string | null;
  idLineaParadaActual?: string | null;
  nombreParadaActual?: string;
  fechaReporteUbicacion?: string | null;
}

export interface AsignacionUnidad {
  id: string;
  idUnidad: string;
  idLinea: string;
  fechaAsignacion: string;
  fechaActualizacion: string;
  idLineaParadaActual?: string;
  fechaReporteUbicacion?: string;
}

/**
 * Stop of the pilot's assigned line from `GET /fleet/units/my-unit/stops`.
 * `idLineaParada` is the value `POST /fleet/units/my-unit/location` expects.
 */
export interface LineaParadaStop {
  idLineaParada: string;
  idParada: string;
  nombre: string;
  orden: number;
}

export interface AsignacionPiloto {
  id: string;
  idEmpleado: string;
  nombreEmpleado?: string;
  idUnidad: string;
  fechaAsignacion: string;
  fechaActualizacion: string;
}

/** Eligible pilot from `GET /fleet/pilots`; `idUnidad` is the unit they are assigned to. */
export interface Piloto {
  idEmpleado: string;
  nombre: string;
  idUnidad?: string;
}

export interface CreateUnidadDto {
  numeroPlaca: string;
  marca: string;
  modelo: string;
  anio: number;
  capacidadPasajeros: number;
  estadoUnidad?: EstadoUnidad;
}

export type UpdateUnidadDto = Partial<CreateUnidadDto>;

export type EstadoAsignacionEstacion = 'ACTIVA' | 'INACTIVA';

/** Active operator-to-station assignment from `GET /fleet/station-assignments`. */
export interface StationAssignment {
  idAsignacionEstacion: string;
  idEmpleado: string;
  nombreEmpleado: string;
  idEstacion: string;
  nombreEstacion: string;
  estadoAsignacion: EstadoAsignacionEstacion;
  fechaAsignacion: string;
}

/** Eligible station operator from `GET /fleet/station-operators`; `idEstacionActual` is their ACTIVA station. */
export interface StationOperator {
  idEmpleado: string;
  nombre: string;
  idEstacionActual?: string;
}

export interface CreateStationAssignmentDto {
  idEmpleado: string;
  idEstacion: string;
}

export interface UpdateStationAssignmentDto {
  idEstacion: string;
}

export interface MiEstacionParada {
  idParada: string;
  nombreParada: string;
}

export interface MiEstacionStation {
  idEstacion: string;
  nombreEstacion: string;
  estadoEstacion: string;
  latitud: number;
  longitud: number;
  parada?: MiEstacionParada;
}

export interface MiEstacionLineStop {
  idLineaParada: string;
  orden: number;
  idParada: string;
  nombreParada: string;
  /** True when this stop is the physical stop the station sits on. */
  isStationStop: boolean;
}

export interface MiEstacionLine {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
  colorHex: string;
  estadoLinea: string;
  tipoPunto: string;
  stops: MiEstacionLineStop[];
}

export interface MiEstacionUnit {
  idUnidad: string;
  numeroPlaca: string;
  estadoUnidad: string;
  idLinea: string;
  idLineaParadaActual?: string;
  nombreParadaActual?: string;
  fechaReporteUbicacion?: string;
  pilotAssigned: boolean;
  nombrePiloto?: string;
}

/** Response of `GET /fleet/my-station` (station operator self-service). */
export interface MiEstacion {
  station: MiEstacionStation;
  lines: MiEstacionLine[];
  units: MiEstacionUnit[];
}

export type TipoPuntoEstacionLinea = 'PRINCIPAL' | 'CONTROL' | 'APOYO';

/** Station-line link from `/infrastructure/stations/:id/lines`. */
export interface EstacionLinea {
  idEstacion: string;
  idLinea: string;
  nombreLinea?: string;
  tipoPunto: TipoPuntoEstacionLinea;
  estadoAsignacion: EstadoAsignacionEstacion;
}

export interface CreateEstacionLineaDto {
  idLinea: string;
  tipoPunto: TipoPuntoEstacionLinea;
  estadoAsignacion?: EstadoAsignacionEstacion;
}

export interface UpdateEstacionLineaDto {
  tipoPunto?: TipoPuntoEstacionLinea;
  estadoAsignacion?: EstadoAsignacionEstacion;
}
