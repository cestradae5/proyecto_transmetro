import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { ALERT_ERROR_CODES, getAlertErrorCode, getAlertErrorMessage } from '../errors';
import type { Alerta, EstadoAlertaDestino, StationAlerts } from '../types';
import { usePolling } from './use-polling';

const MY_STATION_PATH = '/operations/alerts/my-station';

export interface UseStationAlertsResult {
  /** The operator's station, its lines and its alerts, newest first; refreshed every POLL_INTERVAL_MS. */
  data: StationAlerts | null;
  /** Line whose alerts are listed; null lists every line of the station. */
  lineFilter: string | null;
  /** Changes the line filter (applied server side) and reloads. */
  setLineFilter: (idLinea: string | null) => void;
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
  const [lineFilter, setLineFilterState] = useState<string | null>(null);
  // Read by every fetch, so polling keeps the current filter.
  const lineFilterRef = useRef<string | null>(null);
  // Only the latest request may update state, so an answer for a previous
  // filter cannot overwrite the current one.
  const requestSeq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Polling refetches are silent: `loading` is only true until the first answer.
  const fetchStation = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const filter = lineFilterRef.current;
      const result = await apiClient.get<StationAlerts>(
        filter ? `${MY_STATION_PATH}?idLinea=${encodeURIComponent(filter)}` : MY_STATION_PATH,
      );
      if (!mounted.current || seq !== requestSeq.current) return;
      setData(result);
      setNoStation(false);
      setError(null);
    } catch (err: unknown) {
      if (!mounted.current || seq !== requestSeq.current) return;
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

  const setLineFilter = useCallback(
    (idLinea: string | null) => {
      lineFilterRef.current = idLinea;
      setLineFilterState(idLinea);
      fetchStation();
    },
    [fetchStation],
  );

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

  return { data, lineFilter, setLineFilter, noStation, loading, error, refresh, updateStatus };
}
