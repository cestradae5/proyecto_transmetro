import { useId, useState } from 'react';
import type { Unidad } from '../../types/fleet.types';
import { useLineaParadas } from '../../../infrastructure/hooks/use-linea-paradas';

interface UbicacionDialogProps {
  unit: Unidad;
  onReport: (unitId: string, idLineaParada: string) => Promise<unknown>;
  onCorrect: (unitId: string, idLineaParada: string) => Promise<unknown>;
  onClose: () => void;
}

const SELECT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al guardar la ubicación';
}

export function formatReportDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('es-GT');
}

const Shell = ({ unit, children }: { unit: Unidad; children: React.ReactNode }) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div
      role="dialog"
      aria-label="Ubicación de la unidad"
      className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
    >
      <div className="p-6">
        <h2 className="text-xl font-bold text-slate-900 mb-1">Ubicación de la unidad</h2>
        <p className="text-sm text-slate-500 mb-4">Unidad {unit.numeroPlaca}</p>
        {children}
      </div>
    </div>
  </div>
);

const CloseButton = ({ onClose }: { onClose: () => void }) => (
  <button
    type="button"
    onClick={onClose}
    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
  >
    Cancelar
  </button>
);

export function UbicacionDialog(props: UbicacionDialogProps) {
  if (!props.unit.idLinea) {
    return (
      <Shell unit={props.unit}>
        <p className="text-sm text-amber-700 mb-4">
          La unidad no tiene una línea asignada. Asigne una línea antes de reportar su ubicación.
        </p>
        <div className="flex justify-end">
          <CloseButton onClose={props.onClose} />
        </div>
      </Shell>
    );
  }
  return <UbicacionForm {...props} idLinea={props.unit.idLinea} />;
}

function UbicacionForm({
  unit,
  idLinea,
  onReport,
  onCorrect,
  onClose,
}: UbicacionDialogProps & { idLinea: string }) {
  const uid = useId();
  const { lineaParadas, loading, error: loadError, refresh } = useLineaParadas(idLinea);

  const currentId = unit.idLineaParadaActual || '';
  const hasCurrent = currentId !== '';
  const stops = [...lineaParadas].sort((a, b) => a.orden - b.orden);
  const currentStop = stops.find((s) => s.idLineaParada === currentId);
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
      await (hasCurrent ? onCorrect(unit.idUnidad, selected) : onReport(unit.idUnidad, selected));
      onClose();
    } catch (err: unknown) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const selectId = `${uid}-parada`;
  const submitDisabled = submitting || loading || !selected || selected === currentId;

  return (
    <Shell unit={unit}>
      <p className="text-sm text-slate-700 mb-4">
        Ubicación actual:{' '}
        <span className="font-medium">
          {hasCurrent
            ? `${currentStop ? currentStop.parada?.nombreParada : currentId}${reportedAt ? ` (${reportedAt})` : ''}`
            : 'Sin reporte'}
        </span>
      </p>

      {loading ? (
        <p className="text-sm text-slate-500 py-4">Cargando paradas...</p>
      ) : loadError ? (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4 mb-4">
          <span>No se pudieron cargar las paradas: {loadError}</span>
          <button
            type="button"
            onClick={() => refresh()}
            className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-1">
              {hasCurrent ? 'Nueva parada' : 'Parada'}
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
                  {s.orden}. {s.parada?.nombreParada ?? s.idParada}
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
              {hasCurrent ? 'Corregir ubicación' : 'Reportar ubicación'}
            </button>
          </div>
        </form>
      )}

      {(loading || loadError) && (
        <div className="flex justify-end pt-2">
          <CloseButton onClose={onClose} />
        </div>
      )}
    </Shell>
  );
}
