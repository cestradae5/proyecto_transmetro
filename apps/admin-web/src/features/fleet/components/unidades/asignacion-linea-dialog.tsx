import { useId, useState } from 'react';
import { EstadoUnidad } from '../../types/fleet.types';
import type { Unidad } from '../../types/fleet.types';
import type { Linea } from '../../../infrastructure/types/infrastructure.types';

interface AsignacionLineaDialogProps {
  unit: Unidad;
  lineas: Linea[];
  onAssign: (unitId: string, idLinea: string) => Promise<unknown>;
  onReassign: (unitId: string, idLinea: string) => Promise<unknown>;
  onUnassign: (unitId: string) => Promise<unknown>;
  onClose: () => void;
}

const SELECT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al guardar la asignación';
}

export function AsignacionLineaDialog({
  unit,
  lineas,
  onAssign,
  onReassign,
  onUnassign,
  onClose,
}: AsignacionLineaDialogProps) {
  const uid = useId();
  const currentId = unit.idLinea || '';
  const hasLine = currentId !== '';
  const currentLinea = lineas.find((l) => l.idLinea === currentId);
  const isEnServicio = unit.estadoUnidad === EstadoUnidad.EN_SERVICIO;

  const [selected, setSelected] = useState(currentId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (err: unknown) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || (hasLine && selected === currentId)) return;
    return run(() => (hasLine ? onReassign(unit.idUnidad, selected) : onAssign(unit.idUnidad, selected)));
  };

  const handleUnassign = () => {
    if (!confirm(`¿Está seguro de quitar la línea asignada a la unidad ${unit.numeroPlaca}?`)) return;
    return run(() => onUnassign(unit.idUnidad));
  };

  const submitDisabled = submitting || !selected || (hasLine && selected === currentId);
  const selectId = `${uid}-linea`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-label="Asignación de línea"
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Asignación de línea</h2>
          <p className="text-sm text-slate-500 mb-4">Unidad {unit.numeroPlaca}</p>

          {hasLine && (
            <p className="text-sm text-slate-700 mb-4">
              Línea actual:{' '}
              <span className="font-medium">
                {currentLinea ? `${currentLinea.numeroLinea} - ${currentLinea.nombreLinea}` : currentId}
              </span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-1">
                {hasLine ? 'Nueva línea' : 'Línea'}
              </label>
              <select
                id={selectId}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Seleccione una línea</option>
                {lineas.map((l) => (
                  <option key={l.idLinea} value={l.idLinea}>
                    {l.numeroLinea} - {l.nombreLinea}
                  </option>
                ))}
              </select>
              {hasLine && selected === currentId && (
                <p className="text-xs text-slate-500 mt-1">Seleccione una línea distinta a la actual.</p>
              )}
              {hasLine && (
                <p className="text-xs text-slate-500 mt-1">
                  Al reasignar se borra la última parada reportada de la unidad.
                </p>
              )}
            </div>

            {error && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {hasLine && isEnServicio && (
              <p className="text-xs text-amber-700">
                No se puede quitar la línea a una unidad En servicio. Cambie su estado primero.
              </p>
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-4">
              <div>
                {hasLine && (
                  <button
                    type="button"
                    onClick={handleUnassign}
                    disabled={submitting || isEnServicio}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                  >
                    Quitar asignación
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitDisabled}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {hasLine ? 'Reasignar' : 'Asignar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
