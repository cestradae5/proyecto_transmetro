import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { StationOperator } from '../types/fleet.types';
import { getFleetErrorMessage } from './fleet-errors';

export interface UseOperadoresEstacionResult {
  items: StationOperator[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useOperadoresEstacion(): UseOperadoresEstacionResult {
  const [items, setItems] = useState<StationOperator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOperators = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<StationOperator[]>('/fleet/station-operators');
      setItems(data);
    } catch (err: unknown) {
      setError(getFleetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOperators();
  }, [fetchOperators]);

  return { items, loading, error, refresh: fetchOperators };
}
