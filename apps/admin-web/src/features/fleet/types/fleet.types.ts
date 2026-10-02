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
  parqueo?: Parqueo | null;
  idEmpleadoPiloto?: string | null;
  /** Not filled by `GET /fleet/units` (known backend gap). */
  idLineaParadaActual?: string | null;
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
