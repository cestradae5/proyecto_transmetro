export enum EstadoInfraestructura {
  ACTIVA = 'ACTIVA',
  ABIERTA = 'ABIERTA',
  CERRADA = 'CERRADA',
  MANTENIMIENTO = 'MANTENIMIENTO',
}

/** Valid only for Línea (`tbl_linea.estado_linea` DB CHECK constraint). */
export enum EstadoLinea {
  ACTIVA = 'ACTIVA',
  INACTIVA = 'INACTIVA',
}

export enum TipoParqueo {
  PUBLICO = 'PUBLICO',
  PRIVADO = 'PRIVADO',
  MIXTO = 'MIXTO',
}

export enum TipoRecorrido {
  CIRCULAR = 'CIRCULAR',
  LINEAL = 'LINEAL',
}

export enum TipoAfectacion {
  DESVIO = 'DESVIO',
  CIERRE_TEMPORAL = 'CIERRE_TEMPORAL',
  MANTENIMIENTO = 'MANTENIMIENTO',
}

export interface Parada {
  id: number;
  nombreParada: string;
  latitud: number;
  longitud: number;
  estadoParada: EstadoInfraestructura;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface Estacion {
  id: number;
  nombreEstacion: string;
  latitud: number;
  longitud: number;
  idParada: number | null;
  estadoEstacion: EstadoInfraestructura;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface Parqueo {
  id: number;
  nombreParqueo: string;
  tipo: TipoParqueo;
  direccion: string;
  latitud: number;
  longitud: number;
  capacidad: number;
  idEstacion: number | null;
  estadoParqueo: EstadoInfraestructura;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface Linea {
  id: number;
  numero: string;
  nombreLinea: string;
  color_hex: string;
  tipo_recorrido: TipoRecorrido;
  idParqueo: number | null;
  estadoLinea: EstadoLinea;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface Afectacion {
  id: number;
  tipo: TipoAfectacion;
  motivo: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  idParada: number | null;
  idEstacion: number | null;
  estadoAfectacion: EstadoInfraestructura;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export type CreateParadaDto = Omit<Parada, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
export type UpdateParadaDto = Partial<CreateParadaDto>;

export type CreateEstacionDto = Omit<Estacion, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
export type UpdateEstacionDto = Partial<CreateEstacionDto>;

export type CreateParqueoDto = Omit<Parqueo, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
export type UpdateParqueoDto = Partial<CreateParqueoDto>;

export type CreateLineaDto = Omit<Linea, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
export type UpdateLineaDto = Partial<CreateLineaDto>;

export type CreateAfectacionDto = Omit<Afectacion, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
export type UpdateAfectacionDto = Partial<CreateAfectacionDto>;
