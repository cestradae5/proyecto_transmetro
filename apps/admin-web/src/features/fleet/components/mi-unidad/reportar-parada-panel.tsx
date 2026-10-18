import { useState } from 'react';
import type { LineaParadaStop } from '../../types/fleet.types';

interface ReportarParadaPanelProps {
  /** `idLineaParada` of the stop the unit last reported, if any. */
  currentId: string | null;
  stops: LineaParadaStop[];
  stopsLoading: boolean;
  stopsError: string | null;
  onRetryStops: () => void;
  /** Always a POST: pilots have no correction endpoint, a new report overwrites the previous one. */
  onReport: (idLineaParada: string) => Promise<unknown>;
}

/** Stops per column: the list reads top to bottom, then wraps to the next column, so the pilot never scrolls down. */
const ROWS_PER_COLUMN = 4;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al reportar la ubicación';
}

interface StopButtonProps {
  stop: LineaParadaStop;
  isCurrent: boolean;
  isNext: boolean;
  isSending: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function StopButton({ stop, isCurrent, isNext, isSending, disabled, onSelect }: StopButtonProps) {
  const tone = isCurrent
    ? 'bg-primary text-white border-primary'
    : isNext
      ? 'bg-white text-slate-900 border-primary border-[3px]'
      : 'bg-white text-slate-900 border-slate-200';

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-current={isCurrent ? 'location' : undefined}
      aria-label={isCurrent ? `${stop.nombre} (parada actual)` : `Reportar en ${stop.nombre}`}
      className={`w-full h-full min-h-20 flex items-center gap-3 px-3 py-3 rounded-2xl border-2 text-left shadow-sm transition-transform active:scale-[0.98] enabled:hover:border-primary disabled:cursor-not-allowed ${tone} ${
        disabled && !isCurrent ? 'opacity-50' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-xl font-bold ${
          isCurrent ? 'bg-white text-primary' : 'bg-slate-100 text-slate-700'
        }`}
      >
        {stop.orden}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-lg font-semibold leading-tight break-words">{stop.nombre}</span>
        {stop.personasEnParada !== undefined && (
          <span className="block text-sm font-semibold">{stop.personasEnParada} esperando</span>
        )}
        {isCurrent && <span className="block text-sm font-medium opacity-90">Usted está aquí</span>}
        {isNext && !isSending && <span className="block text-sm font-semibold text-primary">Siguiente</span>}
        {isSending && <span className="block text-sm font-medium text-slate-500">Reportando...</span>}
      </span>
      {isCurrent && (
        <span aria-hidden="true" className="material-symbols-outlined text-3xl">
          where_to_vote
        </span>
      )}
    </button>
  );
}

/** One-tap location report: each stop of the assigned line is a large button, sized for use from the driver's seat. */
export function ReportarParadaPanel({
  currentId,
  stops,
  stopsLoading,
  stopsError,
  onRetryStops,
  onReport,
}: ReportarParadaPanelProps) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  if (stopsLoading) {
    return <p className="text-lg text-slate-500 py-6 text-center">Cargando paradas...</p>;
  }

  if (stopsError) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between gap-4">
        <span>No se pudieron cargar las paradas: {stopsError}</span>
        <button
          type="button"
          onClick={onRetryStops}
          className="shrink-0 min-h-12 px-4 font-semibold text-red-700 bg-white border border-red-200 rounded-xl hover:bg-red-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (stops.length === 0) {
    return <p className="text-lg text-slate-500 py-6 text-center">La línea no tiene paradas configuradas.</p>;
  }

  const currentIndex = stops.findIndex((s) => s.idLineaParada === currentId);
  const nextId = currentIndex >= 0 ? stops[currentIndex + 1]?.idLineaParada : undefined;

  const report = async (stop: LineaParadaStop) => {
    if (sendingId || stop.idLineaParada === currentId) return;
    setSendingId(stop.idLineaParada);
    setError(null);
    setConfirmed(null);
    try {
      await onReport(stop.idLineaParada);
      setConfirmed(stop.nombre);
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {confirmed && (
        <div role="status" className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-lg font-semibold flex items-center gap-3">
          <span aria-hidden="true" className="material-symbols-outlined">check_circle</span>
          Ubicación actualizada: {confirmed}
        </div>
      )}
      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-lg">
          {error}
        </div>
      )}
      <div
        data-testid="stop-grid"
        className="grid grid-flow-col auto-cols-[minmax(10rem,1fr)] gap-3 overflow-x-auto pb-1"
        style={{ gridTemplateRows: `repeat(${Math.min(ROWS_PER_COLUMN, stops.length)}, minmax(0, auto))` }}
      >
        {stops.map((stop) => {
          const isCurrent = stop.idLineaParada === currentId;
          return (
            <StopButton
              key={stop.idLineaParada}
              stop={stop}
              isCurrent={isCurrent}
              isNext={stop.idLineaParada === nextId}
              isSending={stop.idLineaParada === sendingId}
              disabled={isCurrent || sendingId !== null}
              onSelect={() => report(stop)}
            />
          );
        })}
      </div>
    </div>
  );
}
