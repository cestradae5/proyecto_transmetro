import { ApiError } from '../../../lib/api-client';

const FLEET_ERROR_MESSAGES: Record<string, string> = {
  UnitNotFound: 'La unidad no existe o fue eliminada',
  LineNotFound: 'La línea no existe',
  EmployeeNotFound: 'El empleado no existe',
  StopNotFound: 'La parada no existe',
  LineAssignmentNotFound: 'La unidad no tiene una asignación de línea',
  PilotAssignmentNotFound: 'La unidad no tiene un piloto asignado',
  DuplicatePlate: 'Ya existe una unidad con este número de placa',
  UnitCannotBeCreatedEnServicio:
    'Una unidad no puede crearse en estado En servicio',
  EnServicioRequiresBothAssignments:
    'Para poner la unidad En servicio debe tener línea y piloto asignados',
  UnitAlreadyHasLineAssignment: 'La unidad ya tiene una línea asignada',
  LineAssignmentUnchanged: 'La unidad ya está asignada a esa línea',
  UnitEnServicioCannotUnassignLine:
    'No se puede quitar la línea a una unidad En servicio',
  StopNotInAssignedLine: 'La parada no pertenece a la línea asignada a la unidad',
  UnitHasNoLineAssignment: 'La unidad no tiene una línea asignada',
  PilotRoleRequired: 'El empleado seleccionado no tiene el rol de piloto',
  PilotAlreadyAssignedToUnit: 'El piloto ya está asignado a otra unidad',
  UnitAlreadyHasPilotAssignment: 'La unidad ya tiene un piloto asignado',
  PilotAssignmentUnchanged: 'La unidad ya tiene asignado a ese piloto',
  UnitEnServicioCannotReassignPilot:
    'No se puede reasignar el piloto de una unidad En servicio',
  UnitEnServicioCannotUnassignPilot:
    'No se puede quitar el piloto a una unidad En servicio',
};

/** Resolves a user-facing Spanish message for a fleet API error. */
export function getFleetErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const code = err.data?.error;
    const mapped =
      typeof code === 'string' ? FLEET_ERROR_MESSAGES[code] : undefined;
    if (mapped) {
      return mapped;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Error de conexión. Por favor, intente de nuevo.';
}

/** Translates a fleet API error and rethrows it as a plain Error. */
export function mapFleetError(err: unknown): never {
  throw new Error(getFleetErrorMessage(err));
}
