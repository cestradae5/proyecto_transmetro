import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type {
  Unidad,
  CreateUnidadDto,
  UpdateUnidadDto,
} from '../types/fleet.types';
import { getFleetErrorMessage, mapFleetError } from './fleet-errors';

export interface UseUnidadesResult {
  items: Unidad[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createUnidad: (data: CreateUnidadDto) => Promise<Unidad>;
  updateUnidad: (id: string, data: UpdateUnidadDto) => Promise<Unidad>;
  deleteUnidad: (id: string) => Promise<void>;
}

export function useUnidades(): UseUnidadesResult {
  const [items, setItems] = useState<Unidad[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUnidades = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Unidad[]>('/fleet/units');
      setItems(data);
    } catch (err: unknown) {
      setError(getFleetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Mutations re-throw an Error carrying the translated message and only
  // refetch after the request succeeded.
  const runMutation = async <T>(request: () => Promise<T>): Promise<T> => {
    let result: T;
    try {
      result = await request();
    } catch (err: unknown) {
      return mapFleetError(err);
    }
    await fetchUnidades();
    return result;
  };

  const createUnidad = (data: CreateUnidadDto): Promise<Unidad> =>
    runMutation(() => apiClient.post<Unidad>('/fleet/units', data));

  const updateUnidad = (id: string, data: UpdateUnidadDto): Promise<Unidad> =>
    runMutation(() => apiClient.patch<Unidad>(`/fleet/units/${id}`, data));

  const deleteUnidad = async (id: string): Promise<void> => {
    await runMutation(() => apiClient.delete(`/fleet/units/${id}`));
  };

  useEffect(() => {
    fetchUnidades();
  }, [fetchUnidades]);

  return {
    items,
    loading,
    error,
    refresh: fetchUnidades,
    createUnidad,
    updateUnidad,
    deleteUnidad,
  };
}
