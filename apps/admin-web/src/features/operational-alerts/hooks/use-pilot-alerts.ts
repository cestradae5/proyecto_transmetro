import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { ALERT_ERROR_CODES, getAlertErrorCode, getAlertErrorMessage } from '../errors';
import type { Alerta, AlertaDestinations, TipoAlerta } from '../types';
import { usePolling } from './use-polling';

const BASE_PATH = '/operations/alerts';

export interface UsePilotAlertsResult {
  /** Unit, line and candidate stations; null while loading, on error, or without unit/line. */
  destinations: AlertaDestinations | null;
  /** The pilot has no unit assigned: an expected state, not an error. */
  noUnit: boolean;
  /** The unit has no line assigned: an expected state, not an error. */
  noLine: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Alerts sent by the pilot, newest first; refreshed every POLL_INTERVAL_MS. */
  sent: Alerta[];
  sentError: string | null;
  /** Sends one alert; rejects with a Spanish message. Refreshes `sent` on success. */
  sendAlert: (tipoAlerta: TipoAlerta, idEstacionDestino: string) => Promise<Alerta>;
}

/** Pilot side of operational alerts: identity and unit come from the token. */
export function usePilotAlerts(): UsePilotAlertsResult {
  const [destinations, setDestinations] = useState<AlertaDestinations | null>(null);
  const [noUnit, setNoUnit] = useState(false);
  const [noLine, setNoLine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Alerta[]>([]);
  const [sentError, setSentError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchSent = useCallback(async () => {
    try {
      const data = await apiClient.get<Alerta[]>(`${BASE_PATH}/sent`);
      if (!mounted.current) return;
      setSent(data);
      setSentError(null);
    } catch (err: unknown) {
      if (mounted.current) setSentError(getAlertErrorMessage(err));
    }
  }, []);

  const fetchDestinations = useCallback(async () => {
    setError(null);
    try {
      const data = await apiClient.get<AlertaDestinations>(`${BASE_PATH}/my-unit/destinations`);
      if (!mounted.current) return;
      setDestinations(data);
      setNoUnit(false);
      setNoLine(false);
    } catch (err: unknown) {
      if (!mounted.current) return;
      const code = getAlertErrorCode(err);
      setDestinations(null);
      setNoUnit(code === ALERT_ERROR_CODES.PILOT_HAS_NO_UNIT_ASSIGNED);
      setNoLine(code === ALERT_ERROR_CODES.UNIT_HAS_NO_LINE);
      if (code !== ALERT_ERROR_CODES.PILOT_HAS_NO_UNIT_ASSIGNED && code !== ALERT_ERROR_CODES.UNIT_HAS_NO_LINE) {
        setError(getAlertErrorMessage(err));
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchDestinations(), fetchSent()]);
    if (mounted.current) setLoading(false);
  }, [fetchDestinations, fetchSent]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  usePolling(fetchSent);

  const sendAlert = async (tipoAlerta: TipoAlerta, idEstacionDestino: string): Promise<Alerta> => {
    let created: Alerta;
    try {
      created = await apiClient.post<Alerta>(BASE_PATH, { tipoAlerta, idEstacionDestino });
    } catch (err: unknown) {
      throw new Error(getAlertErrorMessage(err));
    }
    await fetchSent();
    return created;
  };

  return { destinations, noUnit, noLine, loading, error, refresh, sent, sentError, sendAlert };
}
