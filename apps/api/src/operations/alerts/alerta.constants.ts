// Fixed catalog of quick alerts a pilot can send from their unit (v1, no
// table). The admin-web feature mirrors these codes with Spanish labels.
export const TIPOS_ALERTA_UNIDAD = [
  "ACCIDENTE",
  "FALLA_MECANICA",
  "EMERGENCIA_MEDICA",
  "INCIDENTE_SEGURIDAD",
  "RETRASO",
  "UNIDAD_LLENA",
] as const;
export type TipoAlertaUnidad = (typeof TIPOS_ALERTA_UNIDAD)[number];

// tbl_alerta.estado_alerta in lifecycle order: an alert only moves forward.
export const ESTADOS_ALERTA = ["PENDIENTE", "RECIBIDA", "EN_ATENCION", "RESUELTA"] as const;
export type EstadoAlerta = (typeof ESTADOS_ALERTA)[number];

// States an operator can move an alert to (PENDIENTE is only the initial one).
export const ESTADOS_ALERTA_DESTINO = ["RECIBIDA", "EN_ATENCION", "RESUELTA"] as const;
export type EstadoAlertaDestino = (typeof ESTADOS_ALERTA_DESTINO)[number];

export const TIPO_ORIGEN_UNIDAD = "UNIDAD";
export const TIPO_DESTINO_ESTACION = "ESTACION";

export const ALERTAS_UNIDAD_GESTIONAR = "ALERTAS_UNIDAD_GESTIONAR";
export const ALERTAS_ESTACION_GESTIONAR = "ALERTAS_ESTACION_GESTIONAR";
// Central view of every station's alerts (ADMINISTRADOR_SISTEMA, OPERADOR_CENTRAL).
export const ALERTAS_OPERATIVAS_GESTIONAR = "ALERTAS_OPERATIVAS_GESTIONAR";

export const SENT_ALERTS_LIMIT = 50;
export const STATION_ALERTS_LIMIT = 100;
export const CENTRAL_ALERTS_LIMIT = 300;
