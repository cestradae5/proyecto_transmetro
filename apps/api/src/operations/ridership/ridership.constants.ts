// Ridership (odd/tasks/ridership-capacity.md). Rule values live here so a
// clarified requirement changes one number, not the logic.

// S1: a station alerts when the people waiting reach 150% of its capacity.
export const STATION_ALERT_FACTOR = 1.5;
// S2: a bus below 25% of its capacity waits extra minutes at the station.
export const BUS_LOW_OCCUPANCY_FACTOR = 0.25;
export const EXTRA_WAIT_MINUTES = 5;

// S5: fare charged on every ENTRADA, in GTQ.
export const FARE = 1;

export const TURNSTILE_EVENT_TYPES = ["ENTRADA", "SALIDA"] as const;
export type TurnstileEventType = (typeof TURNSTILE_EVENT_TYPES)[number];

export const CARD_ACTIVE = "ACTIVA";

// S10: system alert written to tbl_alerta (no unit, no author).
export const CAPACITY_ALERT_TYPE = "CAPACIDAD_ESTACION";
export const CAPACITY_ALERT_ORIGIN = "ESTACION";
export const CAPACITY_ALERT_DESTINATION = "CENTRAL";
export const CAPACITY_ALERTS_LIMIT = 100;

// S6: device access for the turnstile endpoint.
export const TURNSTILE_KEY_HEADER = "x-turnstile-key";

export const FLOTA_GESTIONAR = "FLOTA_GESTIONAR";
