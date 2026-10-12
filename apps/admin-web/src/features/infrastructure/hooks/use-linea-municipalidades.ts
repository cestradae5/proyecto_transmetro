import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../../lib/api-client';
import type { LineaMunicipalidad } from '../types/infrastructure.types';

export interface UseLineaMunicipalidadesResult {
  items: LineaMunicipalidad[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addMunicipalidad: (idMunicipalidad: string) => Promise<LineaMunicipalidad>;
  removeMunicipalidad: (idMunicipalidad: string) => Promise<void>;
}

export function mapLineaMunicipalidadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return 'El recurso solicitado no existe o fue eliminado';
    }
    if (err.status === 409 && err.data?.error === 'LINEA_MUNICIPALIDAD_DUPLICATE') {
      return 'La municipalidad ya está asignada a la línea';
    }
  }
  return 'Error de conexión. Por favor, intente de nuevo.';
}

export function useLineaMunicipalidades(lineaId: string): UseLineaMunicipalidadesResult {
  const [items, setItems] = useState<LineaMunicipalidad[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePath = `/infrastructure/lineas/${lineaId}/municipalidades`;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<LineaMunicipalidad[]>(basePath);
      setItems(data);
    } catch (err: unknown) {
      setError(mapLineaMunicipalidadError(err));
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  const runMutation = async <T>(request: () => Promise<T>): Promise<T> => {
    let result: T;
    try {
      result = await request();
    } catch (err: unknown) {
      throw new Error(mapLineaMunicipalidadError(err));
    }
    await fetchItems();
    return result;
  };

  const addMunicipalidad = (idMunicipalidad: string) =>
    runMutation(() => apiClient.post<LineaMunicipalidad>(basePath, { idMunicipalidad }));

  const removeMunicipalidad = async (idMunicipalidad: string): Promise<void> => {
    await runMutation(() => apiClient.delete(`${basePath}/${idMunicipalidad}`));
  };

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading, error, refresh: fetchItems, addMunicipalidad, removeMunicipalidad };
}
