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
