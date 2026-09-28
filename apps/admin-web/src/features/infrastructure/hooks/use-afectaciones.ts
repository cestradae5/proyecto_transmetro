import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { Afectacion, CreateAfectacionDto, UpdateAfectacionDto } from '../types/infrastructure.types';

export function useAfectaciones() {
  const [afectaciones, setAfectaciones] = useState<Afectacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAfectaciones = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Afectacion[]>('/infrastructure/afectaciones');
      setAfectaciones(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar afectaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  const createAfectacion = async (data: CreateAfectacionDto) => {
    const result = await apiClient.post<Afectacion>('/infrastructure/afectaciones', data);
    await fetchAfectaciones();
    return result;
  };

  const updateAfectacion = async (id: number, data: UpdateAfectacionDto) => {
    const result = await apiClient.patch<Afectacion>(`/infrastructure/afectaciones/${id}`, data);
    await fetchAfectaciones();
    return result;
  };

  const deleteAfectacion = async (id: number) => {
    await apiClient.delete(`/infrastructure/afectaciones/${id}`);
    await fetchAfectaciones();
  };

  useEffect(() => {
    fetchAfectaciones();
  }, [fetchAfectaciones]);

  return {
    afectaciones,
    loading,
    error,
    refresh: fetchAfectaciones,
    createAfectacion,
    updateAfectacion,
    deleteAfectacion,
  };
}
