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

/** Action an afectación applies to its target (línea, parada or estación). */
export enum AccionAfectacion {
  ACTIVAR = 'ACTIVAR',
  DESACTIVAR = 'DESACTIVAR',
}

/** Valid only for Municipalidad (`tbl_municipalidad.estado_municipalidad` DB CHECK constraint). */
export enum EstadoMunicipalidad {
  ACTIVA = 'ACTIVA',
  INACTIVA = 'INACTIVA',
}

/** Valid only for Acceso (`tbl_acceso.tipo_acceso` DB CHECK constraint). */
export enum TipoAcceso {
  PEATONAL = 'PEATONAL',
  RAMPA = 'RAMPA',
  ESCALERA = 'ESCALERA',
  ELEVADOR = 'ELEVADOR',
}

/** Valid only for Acceso (`tbl_acceso.estado_acceso` DB CHECK constraint). */
export enum EstadoAcceso {
  HABILITADO = 'HABILITADO',
  DESHABILITADO = 'DESHABILITADO',
}

export interface Parada {
  idParada: number;
  nombreParada: string;
  latitud: number;
  longitud: number;
  estadoParada: EstadoInfraestructura;
  /** Derived by the API: true when an estación extends this parada. */
  esEstacion: boolean;
  /** Id of the estación extending this parada (string at runtime), or null. */
  idEstacion: string | number | null;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

/** An estación is a 1:1 extension of a parada (`tbl_estacion.id_parada` NOT NULL UNIQUE). */
export interface Estacion {
  idEstacion: number;
  nombreEstacion: string;
  latitud: number;
  longitud: number;
  idParada: number;
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
  estadoParqueo: EstadoParqueo;
}

export interface Linea {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
  colorHex: string;
  tipoRecorrido: TipoRecorrido;
  /** A línea can exist without a parqueo (assigned later). */
  idParqueo: string | null;
  estadoLinea: EstadoLinea;
}

/** Line that can be linked to a station, from `GET /infrastructure/stations/:id/lines/available`. */
export interface LineaDisponible {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
}

export interface Municipalidad {
  idMunicipalidad: string;
  nombreMunicipalidad: string;
  departamento: string;
  estadoMunicipalidad: EstadoMunicipalidad;
}

/** Row of `/infrastructure/lineas/:id/municipalidades`. */
export interface LineaMunicipalidad {
  idLinea: string;
  idMunicipalidad: string;
  nombreMunicipalidad?: string;
}

/** Acceso (entrance) of a parada, served under `/infrastructure/paradas/:id/accesos`. */
export interface Acceso {
  idAcceso: string;
  idParada: string;
  nombreAcceso: string;
  latitud: number;
  longitud: number;
  tipoAcceso: TipoAcceso;
  estadoAcceso: EstadoAcceso;
}

/**
 * Immutable history row: an afectación targets exactly one línea, parada or
 * estación. `accion` is a string because legacy rows may carry old types
 * (TEMPORAL...), shown as-is.
 */
export interface Afectacion {
  idAfectacion: string;
  accion: string;
  motivo: string;
  fechaInicio: string;
  fechaFin: string | null;
  idLinea: string | null;
  idParada: string | null;
  idEstacion: string | null;
}

// esEstacion/idEstacion are derived read-only fields: never sent to the API.
export type CreateParadaDto = Omit<
  Parada,
  'idParada' | 'esEstacion' | 'idEstacion' | 'fecha_creacion' | 'fecha_actualizacion'
>;
export type UpdateParadaDto = Partial<CreateParadaDto>;

export type CreateEstacionDto = Omit<Estacion, 'idEstacion'>;
export type UpdateEstacionDto = Partial<CreateEstacionDto>;

/** Estación fields edited from the parada form; idParada comes from the parada itself. */
export type EstacionFormValues = Omit<CreateEstacionDto, 'idParada'>;

/**
 * Payload emitted by the parada form. `estacion` is null when "Es estación" is
 * off; `idEstacion` is the estación the parada had when the form opened (null
 * if none), so the save flow knows whether to create, update or delete it.
 */
export interface ParadaFormValues {
  parada: CreateParadaDto;
  estacion: EstacionFormValues | null;
  idEstacion: string | number | null;
}

export type CreateParqueoDto = Omit<Parqueo, 'idParqueo'>;
export type UpdateParqueoDto = Partial<CreateParqueoDto>;

export type CreateLineaDto = Omit<Linea, 'idLinea' | 'idParqueo'> & {
  idParqueo?: string | null;
};
export type UpdateLineaDto = Partial<CreateLineaDto>;

export type CreateMunicipalidadDto = Omit<Municipalidad, 'idMunicipalidad' | 'estadoMunicipalidad'> & {
  estadoMunicipalidad?: EstadoMunicipalidad;
};
export type UpdateMunicipalidadDto = Partial<CreateMunicipalidadDto>;

export interface CreateLineaMunicipalidadDto {
  idMunicipalidad: string;
}

// The owning parada comes from the route, so idParada is not part of the body.
export type CreateAccesoDto = Omit<Acceso, 'idAcceso' | 'idParada' | 'estadoAcceso'> & {
  estadoAcceso?: EstadoAcceso;
};
export type UpdateAccesoDto = Partial<CreateAccesoDto>;

/** Dates are 'YYYY-MM-DD'; exactly one target id is sent. */
export type CreateAfectacionDto = {
  accion: AccionAfectacion;
  motivo: string;
  fechaInicio: string;
  fechaFin?: string;
} & ({ idLinea: string } | { idParada: string } | { idEstacion: string });

export interface LineaParada {
  idLineaParada: string;
  orden: number;
  minutosHastaSiguiente: number;
  idParada: string;
  idLinea: string;
  // The línea sequence endpoint returns the bare parada row, without the
  // derived esEstacion/idEstacion fields.
  parada: Omit<Parada, 'esEstacion' | 'idEstacion'>;
}

export type CreateLineaParadaDto = {
  idParada: string;
  orden: number;
  minutosHastaSiguiente: number;
};

export type UpdateLineaParadaDto = Partial<
  Pick<CreateLineaParadaDto, 'orden' | 'minutosHastaSiguiente'>
>;
