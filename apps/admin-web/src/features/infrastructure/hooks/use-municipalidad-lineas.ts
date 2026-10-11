import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { Linea } from '../types/infrastructure.types';

/** Líneas of one municipalidad as served by `GET /municipalidades/:id/lineas`. */
export interface MembershipState {
  lineas: Linea[];
  loading: boolean;
  error: string | null;
}

export interface UseMunicipalidadLineasResult {
  /** State of one municipalidad; "loading" until its first request answers. */
  get: (idMunicipalidad: string) => MembershipState;
  reload: (idMunicipalidad: string) => Promise<void>;
  reloadAll: () => Promise<void>;
}

const LOAD_ERROR = 'No se pudieron cargar las líneas de la municipalidad.';
const PENDING: MembershipState = { lineas: [], loading: true, error: null };

/**
 * Líneas of each municipalidad (`GET /infrastructure/municipalidades/:id/lineas`),
 * one request per municipalidad, all in parallel. New ids are loaded when they
 * appear; `reloadAll` refreshes every group (e.g. after links change).
 */
export function useMunicipalidadLineas(ids: string[]): UseMunicipalidadLineasResult {
  const [byId, setById] = useState<Record<string, MembershipState>>({});
  // Latest request per id: older answers are ignored.
  const tokens = useRef<Record<string, number>>({});

  const reload = useCallback(async (id: string) => {
    const token = (tokens.current[id] ?? 0) + 1;
    tokens.current[id] = token;
    setById((prev) => ({ ...prev, [id]: { lineas: prev[id]?.lineas ?? [], loading: true, error: null } }));
    try {
      const lineas = await apiClient.get<Linea[]>(`/infrastructure/municipalidades/${id}/lineas`);
      if (tokens.current[id] !== token) return;
      setById((prev) => ({ ...prev, [id]: { lineas, loading: false, error: null } }));
    } catch {
      if (tokens.current[id] !== token) return;
      setById((prev) => ({ ...prev, [id]: { lineas: prev[id]?.lineas ?? [], loading: false, error: LOAD_ERROR } }));
    }
  }, []);

  const key = ids.join('|');
  useEffect(() => {
    for (const id of key ? key.split('|') : []) {
      if (tokens.current[id] === undefined) void reload(id);
    }
  }, [key, reload]);

  const reloadAll = async () => {
    await Promise.all(ids.map((id) => reload(id)));
  };

  return { get: (id) => byId[id] ?? PENDING, reload, reloadAll };
}
