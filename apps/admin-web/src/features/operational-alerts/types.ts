// Mirrors the API contract in odd/tasks/operational-alerts.md (S11) and
// apps/api/src/operations/alerts/dto/alerta-response.dto.ts.

export type TipoAlerta =
  | 'ACCIDENTE'
  | 'FALLA_MECANICA'
  | 'EMERGENCIA_MEDICA'
  | 'INCIDENTE_SEGURIDAD'
  | 'RETRASO'
  | 'UNIDAD_LLENA';

export type EstadoAlerta = 'PENDIENTE' | 'RECIBIDA' | 'EN_ATENCION' | 'RESUELTA';

/** States an operator can move an alert to. */
export type EstadoAlertaDestino = Exclude<EstadoAlerta, 'PENDIENTE'>;

export interface Alerta {
  idAlerta: string;
  tipoAlerta: string;
  tipoOrigen: string;
  tipoDestino: string;
  estadoAlerta: EstadoAlerta;
  fechaCreacion: string;
  fechaActualizacion: string;
  unidad: { idUnidad: string; numeroPlaca: string };
  estacionDestino: { idEstacion: string; nombreEstacion: string };
  autor: { idEmpleado: string; nombre: string };
  /** State-change observations (non-blank), oldest first. */
  observaciones: AlertaObservacion[];
  /** Line the alert was sent from; null only for legacy alerts of units without line. */
  linea: AlertaLinea | null;
}

export interface AlertaLinea {
  idLinea: string;
  numeroLinea: string;
  nombreLinea: string;
}

export interface AlertaObservacion {
  /** State the alert moved to with this observation. */
  estadoNuevo: EstadoAlerta;
  observacion: string;
  fechaCambio: string;
  autor: { idEmpleado: string; nombre: string };
}

export interface AlertaDestination {
  idEstacion: string;
  nombreEstacion: string;
  orden: number | null;
  suggested: boolean;
}

export interface AlertaDestinations {
  unidad: { idUnidad: string; numeroPlaca: string };
  linea: AlertaLinea;
  destinations: AlertaDestination[];
}

export interface StationAlerts {
  station: { idEstacion: string; nombreEstacion: string };
  /** ACTIVA lines of the station: the operator only receives alerts sent from them. */
  lineas: AlertaLinea[];
  alerts: Alerta[];
}

export interface CentralAlertsUnidad {
  idUnidad: string;
  numeroPlaca: string;
  /** Newest first. */
  alerts: Alerta[];
}

export interface CentralAlertsEstacion {
  idEstacion: string;
  nombreEstacion: string;
  unidades: CentralAlertsUnidad[];
}

export interface CentralAlertsLinea {
  /** null: units without a line assignment ("Sin línea", always last). */
  idLinea: string | null;
  numeroLinea: string | null;
  nombreLinea: string;
  estaciones: CentralAlertsEstacion[];
}

export interface CentralAlerts {
  lineas: CentralAlertsLinea[];
}
