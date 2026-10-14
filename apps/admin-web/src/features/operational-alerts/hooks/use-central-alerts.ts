import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { getAlertErrorMessage } from '../errors';
import type { Alerta, CentralAlerts, EstadoAlertaDestino } from '../types';
import { usePolling } from './use-polling';

const CENTRAL_PATH = '/operations/alerts/central';

export interface UseCentralAlertsResult {
  /** Every station's alerts grouped line -> station -> unit; refreshed every POLL_INTERVAL_MS. */
  data: CentralAlerts | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Moves any alert forward; rejects with a Spanish message. Refreshes on success. */
  updateStatus: (idAlerta: string, estado: EstadoAlertaDestino, observacion?: string) => Promise<Alerta>;
}

/** Central side of operational alerts (admin, central operator). */
export function useCentralAlerts(): UseCentralAlertsResult {
  const [data, setData] = useState<CentralAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Polling refetches are silent: `loading` is only true until the first answer.
  const fetchCentral = useCallback(async () => {
    try {
      const result = await apiClient.get<CentralAlerts>(CENTRAL_PATH);
      if (!mounted.current) return;
      setData(result);
      setError(null);
    } catch (err: unknown) {
      if (!mounted.current) return;
      setError(getAlertErrorMessage(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCentral();
  }, [fetchCentral]);

  usePolling(fetchCentral);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchCentral();
  }, [fetchCentral]);

  const updateStatus = async (
    idAlerta: string,
    estado: EstadoAlertaDestino,
    observacion?: string,
  ): Promise<Alerta> => {
    const trimmed = observacion?.trim();
    let updated: Alerta;
    try {
      updated = await apiClient.patch<Alerta>(`${CENTRAL_PATH}/${encodeURIComponent(idAlerta)}/status`, {
        estado,
        ...(trimmed ? { observacion: trimmed } : {}),
      });
    } catch (err: unknown) {
      throw new Error(getAlertErrorMessage(err));
    }
    await fetchCentral();
    return updated;
  };

  return { data, loading, error, refresh, updateStatus };
}
