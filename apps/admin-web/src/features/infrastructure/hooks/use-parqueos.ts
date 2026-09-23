import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { Parqueo, CreateParqueoDto, UpdateParqueoDto } from '../types/infrastructure.types';

export function useParqueos() {
  const [parqueos, setParqueos] = useState<Parqueo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchParqueos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Parqueo[]>('/infrastructure/parqueos');
      setParqueos(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar parqueos');
    } finally {
      setLoading(false);
    }
  }, []);

  const createParqueo = async (data: CreateParqueoDto) => {
    const result = await apiClient.post<Parqueo>('/infrastructure/parqueos', data);
    await fetchParqueos();
    return result;
  };

  const updateParqueo = async (id: number, data: UpdateParqueoDto) => {
    const result = await apiClient.patch<Parqueo>(`/infrastructure/parqueos/${id}`, data);
    await fetchParqueos();
    return result;
  };

  const deleteParqueo = async (id: number) => {
    await apiClient.delete(`/infrastructure/parqueos/${id}`);
    await fetchParqueos();
  };

  useEffect(() => {
    fetchParqueos();
  }, [fetchParqueos]);

  return {
    parqueos,
    loading,
    error,
    refresh: fetchParqueos,
    createParqueo,
    updateParqueo,
    deleteParqueo,
  };
}
