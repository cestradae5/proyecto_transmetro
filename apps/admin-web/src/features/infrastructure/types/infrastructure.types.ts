/** Valid for Parada (`tbl_parada`) and Estación (`tbl_estacion`) DB CHECK constraints. */
export enum EstadoInfraestructura {
  ACTIVA = 'ACTIVA',
  CERRADA = 'CERRADA',
  MANTENIMIENTO = 'MANTENIMIENTO',
}

/** Valid only for Línea (`tbl_linea.estado_linea` DB CHECK constraint). */
export enum EstadoLinea {
  ACTIVA = 'ACTIVA',
  INACTIVA = 'INACTIVA',
}

export enum TipoParqueo {
  CENTRAL = 'CENTRAL',
  AUXILIAR = 'AUXILIAR',
  TEMPORAL = 'TEMPORAL',
}

/** Valid only for Parqueo (`tbl_parqueo.estado_parqueo` DB CHECK constraint). */
export enum EstadoParqueo {
  ACTIVO = 'ACTIVO',
  CERRADO = 'CERRADO',
  MANTENIMIENTO = 'MANTENIMIENTO',
}

export enum TipoRecorrido {
  CIRCULAR = 'CIRCULAR',
  LINEAL = 'LINEAL',
}

export enum TipoAfectacion {
  TEMPORAL = 'TEMPORAL',
  PERMANENTE = 'PERMANENTE',
  MANTENIMIENTO = 'MANTENIMIENTO',
}

/** Valid only for Afectación (`tbl_afectacion.estado_afectacion` DB CHECK constraint). */
export enum EstadoAfectacion {
  ACTIVA = 'ACTIVA',
  CERRADA = 'CERRADA',
  PENDIENTE = 'PENDIENTE',
}

export interface Parada {
  idParada: number;
  nombreParada: string;
  latitud: number;
  longitud: number;
  estadoParada: EstadoInfraestructura;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

export interface Estacion {
  idEstacion: number;
  nombreEstacion: string;
  latitud: number;
  longitud: number;
  idParada: number | null;
  estadoEstacion: EstadoInfraestructura;
}

export interface Parqueo {
  idParqueo: string;
  nombreParqueo: string;
  tipoParqueo: TipoParqueo;
  direccion: string;
  latitud: number;
  longitud: number;
  capacidadUnidades: number;
  idEstacion: string | null;
  estadoParqueo: EstadoParqueo;
}

export interface Linea {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
  colorHex: string;
  tipoRecorrido: TipoRecorrido;
  idParqueo: string;
  estadoLinea: EstadoLinea;
}

export interface Afectacion {
  idAfectacion: string;
  tipoAfectacion: TipoAfectacion;
  motivo: string;
  fechaInicio: string;
  fechaFin: string | null;
  idParada: string | null;
  idEstacion: string | null;
  estadoAfectacion: EstadoAfectacion;
}

export type CreateParadaDto = Omit<Parada, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
export type UpdateParadaDto = Partial<CreateParadaDto>;

export type CreateEstacionDto = Omit<Estacion, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
export type UpdateEstacionDto = Partial<CreateEstacionDto>;

export type CreateParqueoDto = Omit<Parqueo, 'idParqueo'>;
export type UpdateParqueoDto = Partial<CreateParqueoDto>;

export type CreateLineaDto = Omit<Linea, 'idLinea'>;
export type UpdateLineaDto = Partial<CreateLineaDto>;

export type CreateAfectacionDto = Omit<Afectacion, 'idAfectacion'>;
export type UpdateAfectacionDto = Partial<CreateAfectacionDto>;
