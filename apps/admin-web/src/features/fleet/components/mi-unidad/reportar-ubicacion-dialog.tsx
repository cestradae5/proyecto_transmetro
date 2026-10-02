import { useId, useState } from 'react';
import type { LineaParadaStop, Unidad } from '../../types/fleet.types';
import { formatReportDate } from '../../utils/format';

interface ReportarUbicacionDialogProps {
  unit: Unidad;
  stops: LineaParadaStop[];
  stopsLoading: boolean;
  stopsError: string | null;
  onRetryStops: () => void;
  /** Always a POST: pilots have no correction endpoint, a new report overwrites the previous one. */
  onReport: (idLineaParada: string) => Promise<unknown>;
  onClose: () => void;
}

const SELECT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al reportar la ubicación';
}

const CloseButton = ({ onClose }: { onClose: () => void }) => (
  <button
    type="button"
    onClick={onClose}
    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
  >
    Cancelar
  </button>
);

/** Pilot location report: lists the pilot-scoped stops of the assigned line. */
export function ReportarUbicacionDialog({
  unit,
  stops,
  stopsLoading,
  stopsError,
  onRetryStops,
  onReport,
  onClose,
}: ReportarUbicacionDialogProps) {
  const uid = useId();
  const currentId = unit.idLineaParadaActual || '';
  const hasCurrent = currentId !== '';
  const currentName = unit.nombreParadaActual ?? stops.find((s) => s.idLineaParada === currentId)?.nombre ?? currentId;
  const reportedAt = formatReportDate(unit.fechaReporteUbicacion);

  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || selected === currentId) return;
    setSubmitting(true);
    setError(null);
    try {
      await onReport(selected);
      onClose();
    } catch (err: unknown) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const selectId = `${uid}-parada`;
  const submitDisabled = submitting || !selected || selected === currentId;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-label="Reportar ubicación"
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Reportar ubicación</h2>
          <p className="text-sm text-slate-500 mb-4">Unidad {unit.numeroPlaca}</p>

          <p className="text-sm text-slate-700 mb-4">
            Ubicación actual:{' '}
            <span className="font-medium">
              {hasCurrent ? `${currentName}${reportedAt ? ` (${reportedAt})` : ''}` : 'Sin reporte'}
            </span>
          </p>

          {stopsLoading ? (
            <>
              <p className="text-sm text-slate-500 py-4">Cargando paradas...</p>
              <div className="flex justify-end pt-2">
                <CloseButton onClose={onClose} />
              </div>
            </>
          ) : stopsError ? (
            <>
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4 mb-4">
                <span>No se pudieron cargar las paradas: {stopsError}</span>
                <button
                  type="button"
                  onClick={onRetryStops}
                  className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100"
                >
                  Reintentar
                </button>
              </div>
              <div className="flex justify-end pt-2">
                <CloseButton onClose={onClose} />
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-1">
                  Parada
                </label>
                <select
                  id={selectId}
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Seleccione una parada</option>
                  {stops.map((s) => (
                    <option key={s.idLineaParada} value={s.idLineaParada} disabled={s.idLineaParada === currentId}>
                      {s.orden}. {s.nombre}
                    </option>
                  ))}
                </select>
                {stops.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">La línea no tiene paradas configuradas.</p>
                )}
              </div>

              {error && (
                <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <CloseButton onClose={onClose} />
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  Reportar ubicación
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
