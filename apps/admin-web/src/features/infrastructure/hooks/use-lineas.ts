import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { Linea, CreateLineaDto, UpdateLineaDto } from '../types/infrastructure.types';

export function useLineas() {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLineas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Linea[]>('/infrastructure/lineas');
      setLineas(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar líneas');
    } finally {
      setLoading(false);
    }
  }, []);

  const createLinea = async (data: CreateLineaDto) => {
    const result = await apiClient.post<Linea>('/infrastructure/lineas', data);
    await fetchLineas();
    return result;
  };

  const updateLinea = async (id: number, data: UpdateLineaDto) => {
    const result = await apiClient.patch<Linea>(`/infrastructure/lineas/${id}`, data);
    await fetchLineas();
    return result;
  };

  const deleteLinea = async (id: number) => {
    await apiClient.delete(`/infrastructure/lineas/${id}`);
    await fetchLineas();
  };

  useEffect(() => {
    fetchLineas();
  }, [fetchLineas]);

  return {
    lineas,
    loading,
    error,
    refresh: fetchLineas,
    createLinea,
    updateLinea,
    deleteLinea,
  };
}
