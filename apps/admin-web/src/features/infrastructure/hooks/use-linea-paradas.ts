import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiError } from '../../../lib/api-client';
import type {
  LineaParada,
  CreateLineaParadaDto,
  UpdateLineaParadaDto,
} from '../types/infrastructure.types';

export interface UseLineaParadasResult {
  lineaParadas: LineaParada[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addParada: (data: CreateLineaParadaDto) => Promise<LineaParada>;
  updateParada: (
    lineaParadaId: string,
    data: UpdateLineaParadaDto
  ) => Promise<LineaParada>;
  removeParada: (lineaParadaId: string) => Promise<void>;
}

export function mapLineaParadaError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return 'El recurso solicitado no existe o fue eliminado';
    }
    if (err.status === 409) {
      const code = err.data?.error;
      if (code === 'PARADA_ALREADY_IN_LINEA') {
        return 'Esta parada ya está asignada a la línea';
      }
      if (code === 'ORDEN_DUPLICATE') {
        return 'Ya existe una parada con este orden en la línea';
      }
      if (code === 'LINEA_MIN_PARADAS') {
        return 'Una línea debe tener al menos 2 paradas';
      }
    }
  }
  return 'Error de conexión. Por favor, intente de nuevo.';
}

export function useLineaParadas(lineaId: string): UseLineaParadasResult {
  const [lineaParadas, setLineaParadas] = useState<LineaParada[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLineaParadas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<LineaParada[]>(
        `/infrastructure/lineas/${lineaId}/paradas`
      );
      setLineaParadas(data);
    } catch (err: unknown) {
      setError(mapLineaParadaError(err));
    } finally {
      setLoading(false);
    }
  }, [lineaId]);

  const addParada = async (
    data: CreateLineaParadaDto
  ): Promise<LineaParada> => {
    const result = await apiClient.post<LineaParada>(
      `/infrastructure/lineas/${lineaId}/paradas`,
      data
    );
    await fetchLineaParadas();
    return result;
  };

  const updateParada = async (
    lineaParadaId: string,
    data: UpdateLineaParadaDto
  ): Promise<LineaParada> => {
    const result = await apiClient.patch<LineaParada>(
      `/infrastructure/lineas/${lineaId}/paradas/${lineaParadaId}`,
      data
    );
    await fetchLineaParadas();
    return result;
  };

  const removeParada = async (lineaParadaId: string): Promise<void> => {
    await apiClient.delete(
      `/infrastructure/lineas/${lineaId}/paradas/${lineaParadaId}`
    );
    await fetchLineaParadas();
  };

  useEffect(() => {
    fetchLineaParadas();
  }, [fetchLineaParadas]);

  return {
    lineaParadas,
    loading,
    error,
    refresh: fetchLineaParadas,
    addParada,
    updateParada,
    removeParada,
  };
}
