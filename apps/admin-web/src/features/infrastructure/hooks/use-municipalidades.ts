import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../../lib/api-client';
import type {
  Municipalidad,
  CreateMunicipalidadDto,
  UpdateMunicipalidadDto,
} from '../types/infrastructure.types';

export interface UseMunicipalidadesResult {
  municipalidades: Municipalidad[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createMunicipalidad: (data: CreateMunicipalidadDto) => Promise<Municipalidad>;
  updateMunicipalidad: (id: string, data: UpdateMunicipalidadDto) => Promise<Municipalidad>;
  deleteMunicipalidad: (id: string) => Promise<void>;
}

export function mapMunicipalidadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return 'La municipalidad no existe o fue eliminada';
    }
    if (err.status === 409 && err.data?.error === 'MUNICIPALIDAD_NOMBRE_DUPLICATE') {
      return 'Ya existe una municipalidad con ese nombre';
    }
  }
  return 'Error de conexión. Por favor, intente de nuevo.';
}

export function useMunicipalidades(): UseMunicipalidadesResult {
  const [municipalidades, setMunicipalidades] = useState<Municipalidad[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMunicipalidades = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Municipalidad[]>('/infrastructure/municipalidades');
      setMunicipalidades(data);
    } catch (err: unknown) {
      setError(mapMunicipalidadError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Mutations re-throw an Error carrying the already-translated message so
  // forms can display `err.message` directly.
  const runMutation = async <T>(request: () => Promise<T>): Promise<T> => {
    let result: T;
    try {
      result = await request();
    } catch (err: unknown) {
      throw new Error(mapMunicipalidadError(err));
    }
    await fetchMunicipalidades();
    return result;
  };

  const createMunicipalidad = (data: CreateMunicipalidadDto) =>
    runMutation(() => apiClient.post<Municipalidad>('/infrastructure/municipalidades', data));

  const updateMunicipalidad = (id: string, data: UpdateMunicipalidadDto) =>
    runMutation(() => apiClient.patch<Municipalidad>(`/infrastructure/municipalidades/${id}`, data));

  // Soft delete: the API marks the municipalidad as INACTIVA.
  const deleteMunicipalidad = async (id: string): Promise<void> => {
    await runMutation(() => apiClient.delete(`/infrastructure/municipalidades/${id}`));
  };

  useEffect(() => {
    fetchMunicipalidades();
  }, [fetchMunicipalidades]);

  return {
    municipalidades,
    loading,
    error,
    refresh: fetchMunicipalidades,
    createMunicipalidad,
    updateMunicipalidad,
    deleteMunicipalidad,
  };
}
