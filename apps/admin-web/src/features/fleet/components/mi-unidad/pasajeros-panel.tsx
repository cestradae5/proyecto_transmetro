import { useState, type FormEvent } from 'react';
import type { StopReport, StopReportInput, UnitOccupancy } from '../../hooks/use-pasajeros-unidad';

interface PasajerosPanelProps {
  occupancy: UnitOccupancy | null;
  loading: boolean;
  error: string | null;
  /** The unit has a current stop: reports apply to it. */
  hasCurrentStop: boolean;
  onReport: (input: StopReportInput) => Promise<StopReport>;
}

const WHOLE_NUMBER = /^\d+$/;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al registrar los pasajeros';
}

/**
 * bus-passenger-report S7, S8: who is on board, the last report, and the form
 * where the pilot registers, at the current stop, who got off and on.
 */
export function PasajerosPanel({ occupancy, loading, error, hasCurrentStop, onReport }: PasajerosPanelProps) {
  const [bajaron, setBajaron] = useState('0');
  const [subieron, setSubieron] = useState('0');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<StopReport | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!WHOLE_NUMBER.test(bajaron.trim()) || !WHOLE_NUMBER.test(subieron.trim())) {
      setFormError('Ingrese números enteros mayores o iguales a 0.');
      return;
    }
    setSending(true);
    setFormError(null);
    setConfirmed(null);
    try {
      const result = await onReport({ bajaron: Number(bajaron), subieron: Number(subieron) });
      setConfirmed(result);
      setBajaron('0');
      setSubieron('0');
    } catch (err: unknown) {
      setFormError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const last = occupancy?.ultimoReporte ?? null;
  const inputClass =
    'mt-1 w-full min-h-14 px-4 text-2xl font-bold text-slate-900 border-2 border-slate-200 rounded-xl focus:border-primary focus:outline-none';

  return (
    <section aria-label="Pasajeros en esta parada" className="space-y-4">
      <h3 className="text-lg font-bold text-slate-900">Pasajeros en esta parada</h3>

      {error && !occupancy && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          No se pudieron cargar los pasajeros: {error}
        </div>
      )}
      {loading && !occupancy && <p className="text-slate-500">Cargando pasajeros...</p>}

      {occupancy && (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1">
          <p data-testid="a-bordo" className="text-2xl font-bold text-slate-900">
            A bordo: {occupancy.aBordo} de {occupancy.capacidadPasajeros}
          </p>
          {last && (
            <p data-testid="ultimo-reporte" className="text-base text-slate-600">
              Último reporte en {last.nombreParada}: Bajaron {last.bajaron} · Subieron {last.subieron}
            </p>
          )}
          {last && last.minutosEsperaExtra > 0 && (
            <p className="text-base font-semibold text-amber-700">
              Espere {last.minutosEsperaExtra} minutos adicionales en esta parada
            </p>
          )}
        </div>
      )}

      {confirmed && (
        <div role="status" className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-lg font-semibold">
          Bajaron {confirmed.bajaron} · Subieron {confirmed.subieron} · A bordo {confirmed.aBordo}
        </div>
      )}
      {formError && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-lg">
          {formError}
        </div>
      )}

      {/* noValidate: the native min/step check would block the submit with a
          browser tooltip; the panel shows its own message instead. */}
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-3">
        <label className="block text-base font-semibold text-slate-700">
          Bajaron
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={bajaron}
            onChange={(event) => setBajaron(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-base font-semibold text-slate-700">
          Subieron
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={subieron}
            onChange={(event) => setSubieron(event.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={sending || !hasCurrentStop}
          className="col-span-2 min-h-14 px-4 text-lg font-bold text-white bg-primary rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? 'Registrando...' : 'Registrar pasajeros'}
        </button>
        {!hasCurrentStop && (
          <p className="col-span-2 text-base text-slate-500">Marque primero la parada en la que se encuentra.</p>
        )}
      </form>
    </section>
  );
}
