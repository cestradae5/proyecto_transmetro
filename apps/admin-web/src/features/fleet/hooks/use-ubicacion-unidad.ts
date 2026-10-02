import { apiClient } from '../../../lib/api-client';
import type { AsignacionUnidad } from '../types/fleet.types';
import { mapFleetError } from './fleet-errors';

export interface UseUbicacionUnidadResult {
  reportLocation: (unitId: string, idLineaParada: string) => Promise<AsignacionUnidad>;
  correctLocation: (unitId: string, idLineaParada: string) => Promise<AsignacionUnidad>;
}

const path = (unitId: string) => `/fleet/units/${unitId}/location`;

/**
 * Location mutations. `idLineaParada` is the line-stop junction id, not the stop id.
 * They do not refetch units; the caller refreshes.
 */
const reportLocation = async (unitId: string, idLineaParada: string): Promise<AsignacionUnidad> => {
  try {
    return await apiClient.post<AsignacionUnidad>(path(unitId), { idLineaParada });
  } catch (err: unknown) {
    return mapFleetError(err);
  }
};

const correctLocation = async (unitId: string, idLineaParada: string): Promise<AsignacionUnidad> => {
  try {
    return await apiClient.patch<AsignacionUnidad>(path(unitId), { idLineaParada });
  } catch (err: unknown) {
    return mapFleetError(err);
  }
};

export function useUbicacionUnidad(): UseUbicacionUnidadResult {
  return { reportLocation, correctLocation };
}
