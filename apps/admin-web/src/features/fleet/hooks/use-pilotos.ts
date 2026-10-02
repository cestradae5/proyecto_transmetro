import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { Piloto } from '../types/fleet.types';
import { getFleetErrorMessage } from './fleet-errors';

export interface UsePilotosResult {
  items: Piloto[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePilotos(): UsePilotosResult {
  const [items, setItems] = useState<Piloto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPilotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Piloto[]>('/fleet/pilots');
      setItems(data);
    } catch (err: unknown) {
      setError(getFleetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPilotos();
  }, [fetchPilotos]);

  return { items, loading, error, refresh: fetchPilotos };
}
