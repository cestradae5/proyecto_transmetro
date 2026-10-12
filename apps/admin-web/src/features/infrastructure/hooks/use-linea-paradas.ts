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
  /** Rewrites the whole sequence: position i of `idsLineaParada` gets orden i + 1. */
  reorderParadas: (idsLineaParada: string[]) => Promise<LineaParada[]>;
}

export function mapLineaParadaError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return 'El recurso solicitado no existe o fue eliminado';
    }
    if (err.status === 400 && err.data?.error === 'ORDEN_LIST_MISMATCH') {
      return 'La secuencia de paradas cambió. Recargue e intente de nuevo.';
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

  // Mutations re-throw an Error carrying the already-translated message so
  // components can display `err.message` directly.
  const runMutation = async <T>(request: () => Promise<T>): Promise<T> => {
    let result: T;
    try {
      result = await request();
    } catch (err: unknown) {
      throw new Error(mapLineaParadaError(err));
    }
    await fetchLineaParadas();
    return result;
  };

  const addParada = (data: CreateLineaParadaDto): Promise<LineaParada> =>
    runMutation(() =>
      apiClient.post<LineaParada>(
        `/infrastructure/lineas/${lineaId}/paradas`,
        data
      )
    );

  const updateParada = (
    lineaParadaId: string,
    data: UpdateLineaParadaDto
  ): Promise<LineaParada> =>
    runMutation(() =>
      apiClient.patch<LineaParada>(
        `/infrastructure/lineas/${lineaId}/paradas/${lineaParadaId}`,
        data
      )
    );

  const removeParada = async (lineaParadaId: string): Promise<void> => {
    await runMutation(() =>
      apiClient.delete(
        `/infrastructure/lineas/${lineaId}/paradas/${lineaParadaId}`
      )
    );
  };

  // The PUT answers with the reordered list, so no extra GET is needed.
  const reorderParadas = async (idsLineaParada: string[]): Promise<LineaParada[]> => {
    let result: LineaParada[];
    try {
      result = await apiClient.put<LineaParada[]>(
        `/infrastructure/lineas/${lineaId}/paradas/orden`,
        { idsLineaParada }
      );
    } catch (err: unknown) {
      throw new Error(mapLineaParadaError(err));
    }
    setLineaParadas(result);
    return result;
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
    reorderParadas,
  };
}
