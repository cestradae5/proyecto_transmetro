import { apiClient } from '../../../lib/api-client';
import type { AsignacionUnidad } from '../types/fleet.types';
import { mapFleetError } from './fleet-errors';

export interface UseAsignacionUnidadResult {
  assignLine: (unitId: string, idLinea: string) => Promise<AsignacionUnidad>;
  reassignLine: (unitId: string, idLinea: string) => Promise<AsignacionUnidad>;
  unassignLine: (unitId: string) => Promise<null>;
}

const path = (unitId: string) => `/fleet/units/${unitId}/line-assignment`;

/**
 * Line assignment mutations. They do not refetch units; the caller refreshes.
 * Errors are rethrown as plain Errors with a translated message.
 */
const assignLine = async (unitId: string, idLinea: string): Promise<AsignacionUnidad> => {
  try {
    return await apiClient.post<AsignacionUnidad>(path(unitId), { idLinea });
  } catch (err: unknown) {
    return mapFleetError(err);
  }
};

const reassignLine = async (unitId: string, idLinea: string): Promise<AsignacionUnidad> => {
  try {
    return await apiClient.patch<AsignacionUnidad>(path(unitId), { idLinea });
  } catch (err: unknown) {
    return mapFleetError(err);
  }
};

const unassignLine = async (unitId: string): Promise<null> => {
  try {
    await apiClient.delete(path(unitId));
    return null;
  } catch (err: unknown) {
    return mapFleetError(err);
  }
};

export function useAsignacionUnidad(): UseAsignacionUnidadResult {
  return { assignLine, reassignLine, unassignLine };
}
