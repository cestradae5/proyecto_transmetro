import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../lib/api-client';

// odd/tasks/bus-passenger-report.md S7, S8: the pilot's unit passengers. The
// unit comes from the token; the parada of a report is the unit's current
// stop (reported with the stop buttons).

export interface StopReport {
  idParadaUnidad: string;
  idParada: string;
  nombreParada: string;
  bajaron: number;
  subieron: number;
  aBordo: number;
  porcentaje: number;
  minutosEsperaExtra: number;
  fecha: string;
}

export interface UnitOccupancy {
  idUnidad: string;
  numeroPlaca: string;
  capacidadPasajeros: number;
  aBordo: number;
  porcentaje: number;
  ultimoReporte: StopReport | null;
}

export interface StopReportInput {
  bajaron: number;
  subieron: number;
}

export interface UsePasajerosUnidadResult {
  occupancy: UnitOccupancy | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Registers who got off and on; rejects with the API message on failure. */
  report: (input: StopReportInput) => Promise<StopReport>;
}

const MY_UNIT_PATH = '/operations/ridership/my-unit';

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al cargar los pasajeros';
}

export function usePasajerosUnidad(): UsePasajerosUnidadResult {
  const [occupancy, setOccupancy] = useState<UnitOccupancy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOccupancy(await apiClient.get<UnitOccupancy>(MY_UNIT_PATH));
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const report = useCallback(async (input: StopReportInput) => {
    const result = await apiClient.post<StopReport>(`${MY_UNIT_PATH}/stop-report`, input);
    setOccupancy((current) =>
      current ? { ...current, aBordo: result.aBordo, porcentaje: result.porcentaje, ultimoReporte: result } : current,
    );
    return result;
  }, []);

  return { occupancy, loading, error, refresh, report };
}
