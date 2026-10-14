import { ApiError } from '../../lib/api-client';

const ALERT_ERROR_MESSAGES: Record<string, string> = {
  PilotHasNoUnitAssigned: 'No tiene una unidad asignada',
  UnitHasNoLine: 'Su unidad no tiene una línea asignada',
  DestinationNotOnLine: 'La estación de destino no pertenece a la línea de la unidad',
  OperatorHasNoStation: 'No tiene una estación asignada',
  AlertNotFound: 'La alerta no existe o no pertenece a su estación',
  InvalidAlertTransition: 'La alerta ya cambió de estado. Actualice la lista e intente de nuevo',
};

/** Backend error class names the alert screens branch on. */
export const ALERT_ERROR_CODES = {
  PILOT_HAS_NO_UNIT_ASSIGNED: 'PilotHasNoUnitAssigned',
  UNIT_HAS_NO_LINE: 'UnitHasNoLine',
  OPERATOR_HAS_NO_STATION: 'OperatorHasNoStation',
} as const;

export function getAlertErrorCode(err: unknown): string | undefined {
  if (err instanceof ApiError) {
    const code = err.data?.error;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** User-facing Spanish message for an alerts API error. */
export function getAlertErrorMessage(err: unknown): string {
  const code = getAlertErrorCode(err);
  const mapped = code ? ALERT_ERROR_MESSAGES[code] : undefined;
  if (mapped) return mapped;
  if (err instanceof Error && err.message) return err.message;
  return 'Error de conexión. Por favor, intente de nuevo.';
}
