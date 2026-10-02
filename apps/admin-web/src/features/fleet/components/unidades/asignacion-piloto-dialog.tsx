import { useId, useState } from 'react';
import { EstadoUnidad } from '../../types/fleet.types';
import type { Piloto, Unidad } from '../../types/fleet.types';

interface AsignacionPilotoDialogProps {
  unit: Unidad;
  pilotos: Piloto[];
  /** All units, used to show the plate of the unit a pilot is currently on. */
  unidades?: Unidad[];
  onAssign: (unitId: string, idEmpleado: string) => Promise<unknown>;
  /** Moves the pilot to `unitId` (target unit) from their current unit. */
  onReassign: (unitId: string, idEmpleado: string) => Promise<unknown>;
  onUnassign: (unitId: string) => Promise<unknown>;
  onClose: () => void;
}

const SELECT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al guardar la asignación';
}

export function AsignacionPilotoDialog({
  unit,
  pilotos,
  unidades = [],
  onAssign,
  onReassign,
  onUnassign,
  onClose,
}: AsignacionPilotoDialogProps) {
  const uid = useId();
  const currentId = unit.idEmpleadoPiloto || '';
  const hasPilot = currentId !== '';
  const currentPiloto = pilotos.find((p) => p.idEmpleado === currentId);
  const isEnServicio = unit.estadoUnidad === EstadoUnidad.EN_SERVICIO;

  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitLabel = (idUnidad: string) =>
    unidades.find((u) => u.idUnidad === idUnidad)?.numeroPlaca ?? idUnidad;

  const selectedPiloto = pilotos.find((p) => p.idEmpleado === selected);
  const alreadyHere = !!selectedPiloto && selectedPiloto.idUnidad === unit.idUnidad;
  const isMove = !!selectedPiloto?.idUnidad && !alreadyHere;
  const sourceUnit = isMove ? unidades.find((u) => u.idUnidad === selectedPiloto?.idUnidad) : undefined;
  const sourceEnServicio = sourceUnit?.estadoUnidad === EstadoUnidad.EN_SERVICIO;

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
    if (!selectedPiloto || alreadyHere || sourceEnServicio) return;
    return run(() =>
      isMove ? onReassign(unit.idUnidad, selectedPiloto.idEmpleado) : onAssign(unit.idUnidad, selectedPiloto.idEmpleado)
    );
  };

  const handleUnassign = () => {
    if (!confirm(`¿Está seguro de quitar el piloto asignado a la unidad ${unit.numeroPlaca}?`)) return;
    return run(() => onUnassign(unit.idUnidad));
  };

  const submitDisabled = submitting || !selectedPiloto || alreadyHere || sourceEnServicio;
  const selectId = `${uid}-piloto`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-label="Asignación de piloto"
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Asignación de piloto</h2>
          <p className="text-sm text-slate-500 mb-4">Unidad {unit.numeroPlaca}</p>

          {hasPilot && (
            <p className="text-sm text-slate-700 mb-4">
              Piloto actual:{' '}
              <span className="font-medium">{currentPiloto ? currentPiloto.nombre : currentId}</span>
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!hasPilot && (
              <div>
                <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-1">
                  Piloto
                </label>
                <select
                  id={selectId}
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">Seleccione un piloto</option>
                  {pilotos.map((p) => (
                    <option key={p.idEmpleado} value={p.idEmpleado}>
                      {p.idUnidad && p.idUnidad !== unit.idUnidad
                        ? `${p.nombre} (en unidad ${unitLabel(p.idUnidad)})`
                        : p.idUnidad
                          ? `${p.nombre} (ya asignado a esta unidad)`
                          : p.nombre}
                    </option>
                  ))}
                </select>
                {alreadyHere && (
                  <p className="text-xs text-slate-500 mt-1">Este piloto ya está asignado a esta unidad.</p>
                )}
                {isMove && !sourceEnServicio && (
                  <p className="text-xs text-slate-500 mt-1">
                    El piloto será movido desde la unidad {unitLabel(selectedPiloto.idUnidad as string)} a esta unidad.
                  </p>
                )}
                {sourceEnServicio && (
                  <p className="text-xs text-amber-700 mt-1">
                    No se puede mover el piloto de una unidad En servicio. Cambie su estado primero.
                  </p>
                )}
              </div>
            )}

            {error && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {hasPilot && isEnServicio && (
              <p className="text-xs text-amber-700">
                No se puede quitar el piloto a una unidad En servicio. Cambie su estado primero.
              </p>
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-4">
              <div>
                {hasPilot && (
                  <button
                    type="button"
                    onClick={handleUnassign}
                    disabled={submitting || isEnServicio}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                  >
                    Quitar piloto
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
                {!hasPilot && (
                  <button
                    type="submit"
                    disabled={submitDisabled}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isMove ? 'Reasignar' : 'Asignar'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
