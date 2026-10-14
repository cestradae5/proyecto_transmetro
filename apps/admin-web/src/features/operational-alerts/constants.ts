import type { EstadoAlerta, TipoAlerta } from './types';

/** Both alert screens refetch on this interval (no real-time push in v1). */
export const POLL_INTERVAL_MS = 10_000;

/** Fixed catalog, same codes and order as the API (alerta.constants.ts). */
export const TIPOS_ALERTA: { value: TipoAlerta; label: string; icon: string }[] = [
  { value: 'ACCIDENTE', label: 'Accidente', icon: 'car_crash' },
  { value: 'FALLA_MECANICA', label: 'Falla mecánica', icon: 'build' },
  { value: 'EMERGENCIA_MEDICA', label: 'Emergencia médica', icon: 'medical_services' },
  { value: 'INCIDENTE_SEGURIDAD', label: 'Incidente de seguridad', icon: 'shield' },
  { value: 'RETRASO', label: 'Retraso', icon: 'schedule' },
  { value: 'UNIDAD_LLENA', label: 'Unidad llena', icon: 'groups' },
];

export const TIPO_ALERTA_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_ALERTA.map((tipo) => [tipo.value, tipo.label]),
);

/** Lifecycle order: an alert only moves forward. */
export const ESTADOS_ALERTA: EstadoAlerta[] = ['PENDIENTE', 'RECIBIDA', 'EN_ATENCION', 'RESUELTA'];

export const ESTADO_ALERTA_LABEL: Record<EstadoAlerta, string> = {
  PENDIENTE: 'Pendiente',
  RECIBIDA: 'Recibida',
  EN_ATENCION: 'En atención',
  RESUELTA: 'Resuelta',
};

export const ESTADO_ALERTA_BADGE: Record<EstadoAlerta, string> = {
  PENDIENTE: 'bg-red-100 text-red-700',
  RECIBIDA: 'bg-amber-100 text-amber-700',
  EN_ATENCION: 'bg-blue-100 text-blue-700',
  RESUELTA: 'bg-green-100 text-green-700',
};
