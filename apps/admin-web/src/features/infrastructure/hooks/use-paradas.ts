import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { Parada, CreateParadaDto, UpdateParadaDto } from '../types/infrastructure.types';

export function useParadas() {
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchParadas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Parada[]>('/infrastructure/paradas');
      setParadas(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar paradas');
    } finally {
      setLoading(false);
    }
  }, []);

  const createParada = async (data: CreateParadaDto) => {
    const result = await apiClient.post<Parada>('/infrastructure/paradas', data);
    await fetchParadas();
    return result;
  };

  const updateParada = async (id: number, data: UpdateParadaDto) => {
    const result = await apiClient.patch<Parada>(`/infrastructure/paradas/${id}`, data);
    await fetchParadas();
    return result;
  };

  const deleteParada = async (id: number) => {
    try {
      await apiClient.delete(`/infrastructure/paradas/${id}`);
      await fetchParadas();
    } catch (err: any) {
      console.error('Error al eliminar parada:', err);
      throw err;
    }
  };

  useEffect(() => {
    fetchParadas();
  }, [fetchParadas]);

  return {
    paradas,
    loading,
    error,
    refresh: fetchParadas,
    createParada,
    updateParada,
    deleteParada,
  };
}
