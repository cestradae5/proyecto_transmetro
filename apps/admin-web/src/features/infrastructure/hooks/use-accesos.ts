import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../../lib/api-client';
import type { Acceso, CreateAccesoDto, UpdateAccesoDto } from '../types/infrastructure.types';

export interface UseAccesosResult {
  accesos: Acceso[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createAcceso: (data: CreateAccesoDto) => Promise<Acceso>;
  updateAcceso: (accesoId: string, data: UpdateAccesoDto) => Promise<Acceso>;
  deleteAcceso: (accesoId: string) => Promise<void>;
}

export function mapAccesoError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return 'La parada o el acceso no existe o fue eliminado';
    }
    if (err.status === 400) {
      return 'Los datos del acceso no son válidos';
    }
  }
  return 'Error de conexión. Por favor, intente de nuevo.';
}

export function useAccesos(paradaId: string): UseAccesosResult {
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePath = `/infrastructure/paradas/${paradaId}/accesos`;

  const fetchAccesos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Acceso[]>(basePath);
      setAccesos(data);
    } catch (err: unknown) {
      setError(mapAccesoError(err));
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  const runMutation = async <T>(request: () => Promise<T>): Promise<T> => {
    let result: T;
    try {
      result = await request();
    } catch (err: unknown) {
      throw new Error(mapAccesoError(err));
    }
    await fetchAccesos();
    return result;
  };

  const createAcceso = (data: CreateAccesoDto) =>
    runMutation(() => apiClient.post<Acceso>(basePath, data));

  const updateAcceso = (accesoId: string, data: UpdateAccesoDto) =>
    runMutation(() => apiClient.patch<Acceso>(`${basePath}/${accesoId}`, data));

  // Soft delete: the API marks the acceso as DESHABILITADO.
  const deleteAcceso = async (accesoId: string): Promise<void> => {
    await runMutation(() => apiClient.delete(`${basePath}/${accesoId}`));
  };

  useEffect(() => {
    fetchAccesos();
  }, [fetchAccesos]);

  return { accesos, loading, error, refresh: fetchAccesos, createAcceso, updateAcceso, deleteAcceso };
}
