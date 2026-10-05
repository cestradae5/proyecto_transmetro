import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type {
  CreateStationAssignmentDto,
  StationAssignment,
  UpdateStationAssignmentDto,
} from '../types/fleet.types';
import { getFleetErrorMessage, mapFleetError } from './fleet-errors';

export interface UseAsignacionEstacionResult {
  /** Active operator-to-station assignments. */
  items: StationAssignment[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  assign: (idEmpleado: string, idEstacion: string) => Promise<StationAssignment>;
  /** Moves the assignment `assignmentId` to the station `idEstacion`. */
  reassign: (assignmentId: string, idEstacion: string) => Promise<StationAssignment>;
  unassign: (assignmentId: string) => Promise<null>;
}

const BASE_PATH = '/fleet/station-assignments';

/**
 * Station assignments list plus mutations. Each successful mutation refreshes
 * the list; errors are rethrown as plain Errors with a translated message.
 */
export function useAsignacionEstacion(): UseAsignacionEstacionResult {
  const [items, setItems] = useState<StationAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<StationAssignment[]>(BASE_PATH);
      setItems(data);
    } catch (err: unknown) {
      setError(getFleetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const assign = async (idEmpleado: string, idEstacion: string): Promise<StationAssignment> => {
    const body: CreateStationAssignmentDto = { idEmpleado, idEstacion };
    let result: StationAssignment;
    try {
      result = await apiClient.post<StationAssignment>(BASE_PATH, body);
    } catch (err: unknown) {
      return mapFleetError(err);
    }
    await fetchAssignments();
    return result;
  };

  const reassign = async (assignmentId: string, idEstacion: string): Promise<StationAssignment> => {
    const body: UpdateStationAssignmentDto = { idEstacion };
    let result: StationAssignment;
    try {
      result = await apiClient.patch<StationAssignment>(`${BASE_PATH}/${assignmentId}`, body);
    } catch (err: unknown) {
      return mapFleetError(err);
    }
    await fetchAssignments();
    return result;
  };

  const unassign = async (assignmentId: string): Promise<null> => {
    try {
      await apiClient.delete(`${BASE_PATH}/${assignmentId}`);
    } catch (err: unknown) {
      return mapFleetError(err);
    }
    await fetchAssignments();
    return null;
  };

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  return { items, loading, error, refresh: fetchAssignments, assign, reassign, unassign };
}
