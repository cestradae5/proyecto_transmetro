import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type {
  CreateEstacionLineaDto,
  EstacionLinea,
  UpdateEstacionLineaDto,
} from '../../fleet/types/fleet.types';
import { getFleetErrorMessage, mapFleetError } from '../../fleet/hooks/fleet-errors';

export interface UseEstacionLineasResult {
  items: EstacionLinea[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addLine: (data: CreateEstacionLineaDto) => Promise<EstacionLinea>;
  updateLine: (lineId: string, data: UpdateEstacionLineaDto) => Promise<EstacionLinea>;
  removeLine: (lineId: string) => Promise<null>;
}

/**
 * Lines linked to one station. Without a station id nothing is fetched.
 * Successful mutations refresh the list; errors are rethrown as plain Errors
 * with a translated message.
 */
export function useEstacionLineas(stationId: string | null | undefined): UseEstacionLineasResult {
  const [items, setItems] = useState<EstacionLinea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePath = `/infrastructure/stations/${stationId}/lines`;

  const fetchLines = useCallback(async () => {
    if (!stationId) {
      setItems([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<EstacionLinea[]>(`/infrastructure/stations/${stationId}/lines`);
      setItems(data);
    } catch (err: unknown) {
      setError(getFleetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  const addLine = async (data: CreateEstacionLineaDto): Promise<EstacionLinea> => {
    let result: EstacionLinea;
    try {
      result = await apiClient.post<EstacionLinea>(basePath, data);
    } catch (err: unknown) {
      return mapFleetError(err);
    }
    await fetchLines();
    return result;
  };

  const updateLine = async (lineId: string, data: UpdateEstacionLineaDto): Promise<EstacionLinea> => {
    let result: EstacionLinea;
    try {
      result = await apiClient.patch<EstacionLinea>(`${basePath}/${lineId}`, data);
    } catch (err: unknown) {
      return mapFleetError(err);
    }
    await fetchLines();
    return result;
  };

  const removeLine = async (lineId: string): Promise<null> => {
    try {
      await apiClient.delete(`${basePath}/${lineId}`);
    } catch (err: unknown) {
      return mapFleetError(err);
    }
    await fetchLines();
    return null;
  };

  useEffect(() => {
    fetchLines();
  }, [fetchLines]);

  return { items, loading, error, refresh: fetchLines, addLine, updateLine, removeLine };
}
