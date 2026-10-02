import { apiClient } from '../../../lib/api-client';
import type { AsignacionPiloto } from '../types/fleet.types';
import { mapFleetError } from './fleet-errors';

export interface UseAsignacionPilotoResult {
  assignPilot: (unitId: string, idEmpleado: string) => Promise<AsignacionPiloto>;
  /** Moves the pilot `idEmpleado` from their current unit to `unitId` (target unit). */
  reassignPilot: (unitId: string, idEmpleado: string) => Promise<AsignacionPiloto>;
  unassignPilot: (unitId: string) => Promise<null>;
}

const path = (unitId: string) => `/fleet/units/${unitId}/pilot-assignment`;

/**
 * Pilot assignment mutations. They do not refetch; the caller refreshes.
 * Errors are rethrown as plain Errors with a translated message.
 */
const assignPilot = async (unitId: string, idEmpleado: string): Promise<AsignacionPiloto> => {
  try {
    return await apiClient.post<AsignacionPiloto>(path(unitId), { idEmpleado });
  } catch (err: unknown) {
    return mapFleetError(err);
  }
};

const reassignPilot = async (unitId: string, idEmpleado: string): Promise<AsignacionPiloto> => {
  try {
    return await apiClient.patch<AsignacionPiloto>(path(unitId), { idEmpleado });
  } catch (err: unknown) {
    return mapFleetError(err);
  }
};

const unassignPilot = async (unitId: string): Promise<null> => {
  try {
    await apiClient.delete(path(unitId));
    return null;
  } catch (err: unknown) {
    return mapFleetError(err);
  }
};

export function useAsignacionPiloto(): UseAsignacionPilotoResult {
  return { assignPilot, reassignPilot, unassignPilot };
}
