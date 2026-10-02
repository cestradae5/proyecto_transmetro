import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../../../lib/api-client';
import type { AsignacionUnidad, LineaParadaStop, Unidad } from '../types/fleet.types';
import {
  FLEET_ERROR_CODES,
  getFleetErrorCode,
  getFleetErrorMessage,
  mapFleetError,
} from './fleet-errors';

export interface UseMiUnidadResult {
  /** The pilot's assigned unit; null while loading, on error, or when none is assigned. */
  unit: Unidad | null;
  /** True once the backend answered `PilotHasNoUnitAssigned`: an expected state, not an error. */
  noUnit: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Ordered stops of the unit's line; empty when the unit has no line. */
  stops: LineaParadaStop[];
  stopsLoading: boolean;
  stopsError: string | null;
  refreshStops: () => Promise<void>;
  /** Reports the unit at `idLineaParada` (POST; repeating it overwrites) and refreshes the unit. */
  reportLocation: (idLineaParada: string) => Promise<AsignacionUnidad>;
}

const MY_UNIT_PATH = '/fleet/units/my-unit';

/** Pilot self-service: identity comes from the token, so no unit id is needed. */
export function useMiUnidad(): UseMiUnidadResult {
  const [unit, setUnit] = useState<Unidad | null>(null);
  const [noUnit, setNoUnit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stops, setStops] = useState<LineaParadaStop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [stopsError, setStopsError] = useState<string | null>(null);

  // After the first successful load, refetches are silent so the page does not
  // flash its loading state after a location report.
  const hasLoaded = useRef(false);

  const fetchUnit = useCallback(async () => {
    if (!hasLoaded.current) setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<Unidad>(MY_UNIT_PATH);
      setUnit(data);
      setNoUnit(false);
      hasLoaded.current = true;
    } catch (err: unknown) {
      if (getFleetErrorCode(err) === FLEET_ERROR_CODES.PILOT_HAS_NO_UNIT_ASSIGNED) {
        setUnit(null);
        setNoUnit(true);
        hasLoaded.current = true;
      } else {
        setError(getFleetErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const idLinea = unit?.idLinea ?? null;

  const fetchStops = useCallback(async () => {
    if (!idLinea) {
      setStops([]);
      setStopsError(null);
      return;
    }
    setStopsLoading(true);
    setStopsError(null);
    try {
      const data = await apiClient.get<LineaParadaStop[]>(`${MY_UNIT_PATH}/stops`);
      setStops([...data].sort((a, b) => a.orden - b.orden));
    } catch (err: unknown) {
      // The line may have been unassigned since the unit loaded: same as no line.
      if (getFleetErrorCode(err) === FLEET_ERROR_CODES.UNIT_HAS_NO_LINE_ASSIGNMENT) {
        setStops([]);
      } else {
        setStopsError(getFleetErrorMessage(err));
      }
    } finally {
      setStopsLoading(false);
    }
  }, [idLinea]);

  const reportLocation = async (idLineaParada: string): Promise<AsignacionUnidad> => {
    let result: AsignacionUnidad;
    try {
      result = await apiClient.post<AsignacionUnidad>(`${MY_UNIT_PATH}/location`, { idLineaParada });
    } catch (err: unknown) {
      return mapFleetError(err);
    }
    await fetchUnit();
    return result;
  };

  useEffect(() => {
    fetchUnit();
  }, [fetchUnit]);

  useEffect(() => {
    fetchStops();
  }, [fetchStops]);

  return {
    unit,
    noUnit,
    loading,
    error,
    refresh: fetchUnit,
    stops,
    stopsLoading,
    stopsError,
    refreshStops: fetchStops,
    reportLocation,
  };
}
