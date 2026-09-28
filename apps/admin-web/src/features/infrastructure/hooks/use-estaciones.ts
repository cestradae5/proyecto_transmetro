import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { Estacion, CreateEstacionDto, UpdateEstacionDto } from '../types/infrastructure.types';

export function useEstaciones() {
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEstaciones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Estacion[]>('/infrastructure/estaciones');
      setEstaciones(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar estaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  const createEstacion = async (data: CreateEstacionDto) => {
    const result = await apiClient.post<Estacion>('/infrastructure/estaciones', data);
    await fetchEstaciones();
    return result;
  };

  const updateEstacion = async (id: number, data: UpdateEstacionDto) => {
    const result = await apiClient.patch<Estacion>(`/infrastructure/estaciones/${id}`, data);
    await fetchEstaciones();
    return result;
  };

  const deleteEstacion = async (id: number) => {
    try {
      await apiClient.delete(`/infrastructure/estaciones/${id}`);
      await fetchEstaciones();
    } catch (err: any) {
      console.error('Error al eliminar estación:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchEstaciones();
  }, [fetchEstaciones]);

  return {
    estaciones,
    loading,
    error,
    refresh: fetchEstaciones,
    createEstacion,
    updateEstacion,
    deleteEstacion,
  };
}
