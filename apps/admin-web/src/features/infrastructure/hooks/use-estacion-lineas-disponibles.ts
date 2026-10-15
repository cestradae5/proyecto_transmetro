import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import { getFleetErrorMessage } from '../../fleet/hooks/fleet-errors';
import type { LineaDisponible } from '../types/infrastructure.types';

export interface UseEstacionLineasDisponiblesResult {
  items: LineaDisponible[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Lines that can still be linked to one station: their route stops at the
 * station's parada and they are not linked yet. Without a station id nothing
 * is fetched.
 */
export function useEstacionLineasDisponibles(
  stationId: string | null | undefined
): UseEstacionLineasDisponiblesResult {
  const [items, setItems] = useState<LineaDisponible[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailable = useCallback(async () => {
    if (!stationId) {
      setItems([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(await apiClient.get<LineaDisponible[]>(`/infrastructure/stations/${stationId}/lines/available`));
    } catch (err: unknown) {
      setItems([]);
      setError(getFleetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    fetchAvailable();
  }, [fetchAvailable]);

  return { items, loading, error, refresh: fetchAvailable };
}
