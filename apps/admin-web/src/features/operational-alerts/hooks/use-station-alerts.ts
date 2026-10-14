import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { ALERT_ERROR_CODES, getAlertErrorCode, getAlertErrorMessage } from '../errors';
import type { Alerta, EstadoAlertaDestino, StationAlerts } from '../types';
import { usePolling } from './use-polling';

const MY_STATION_PATH = '/operations/alerts/my-station';

export interface UseStationAlertsResult {
  /** The operator's station and its alerts, newest first; refreshed every POLL_INTERVAL_MS. */
  data: StationAlerts | null;
  /** The operator has no ACTIVA station: an expected state, not an error. */
  noStation: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Moves an alert forward; rejects with a Spanish message. Refreshes on success. */
  updateStatus: (idAlerta: string, estado: EstadoAlertaDestino, observacion?: string) => Promise<Alerta>;
}

/** Station operator side of operational alerts: the station comes from the token. */
export function useStationAlerts(): UseStationAlertsResult {
  const [data, setData] = useState<StationAlerts | null>(null);
  const [noStation, setNoStation] = useState(false);
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
  const fetchStation = useCallback(async () => {
    try {
      const result = await apiClient.get<StationAlerts>(MY_STATION_PATH);
      if (!mounted.current) return;
      setData(result);
      setNoStation(false);
      setError(null);
    } catch (err: unknown) {
      if (!mounted.current) return;
      if (getAlertErrorCode(err) === ALERT_ERROR_CODES.OPERATOR_HAS_NO_STATION) {
        setData(null);
        setNoStation(true);
        setError(null);
      } else {
        setError(getAlertErrorMessage(err));
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStation();
  }, [fetchStation]);

  usePolling(fetchStation);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchStation();
  }, [fetchStation]);

  const updateStatus = async (
    idAlerta: string,
    estado: EstadoAlertaDestino,
    observacion?: string,
  ): Promise<Alerta> => {
    const trimmed = observacion?.trim();
    let updated: Alerta;
    try {
      updated = await apiClient.patch<Alerta>(`/operations/alerts/${encodeURIComponent(idAlerta)}/status`, {
        estado,
        ...(trimmed ? { observacion: trimmed } : {}),
      });
    } catch (err: unknown) {
      throw new Error(getAlertErrorMessage(err));
    }
    await fetchStation();
    return updated;
  };

  return { data, noStation, loading, error, refresh, updateStatus };
}
