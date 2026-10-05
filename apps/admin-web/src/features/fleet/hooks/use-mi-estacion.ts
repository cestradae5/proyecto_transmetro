import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { MiEstacion } from '../types/fleet.types';
import {
  FLEET_ERROR_CODES,
  getFleetErrorCode,
  getFleetErrorMessage,
} from './fleet-errors';

export interface UseMiEstacionResult {
  /** The operator's station; null while loading, on error, or when none is assigned. */
  data: MiEstacion | null;
  /** True once the backend answered `OperatorHasNoStation`: an expected state, not an error. */
  noStation: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Station operator self-service: identity comes from the token. */
export function useMiEstacion(): UseMiEstacionResult {
  const [data, setData] = useState<MiEstacion | null>(null);
  const [noStation, setNoStation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.get<MiEstacion>('/fleet/my-station');
      setData(result);
      setNoStation(false);
    } catch (err: unknown) {
      if (getFleetErrorCode(err) === FLEET_ERROR_CODES.OPERATOR_HAS_NO_STATION) {
        setData(null);
        setNoStation(true);
      } else {
        setError(getFleetErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStation();
  }, [fetchStation]);

  return { data, noStation, loading, error, refresh: fetchStation };
}
