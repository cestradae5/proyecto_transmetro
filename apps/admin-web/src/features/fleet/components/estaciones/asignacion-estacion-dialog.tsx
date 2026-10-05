import { useId, useState } from 'react';
import type { Estacion } from '../../../infrastructure/types/infrastructure.types';
import type { StationAssignment, StationOperator } from '../../types/fleet.types';

interface AsignacionEstacionDialogProps {
  /** Present -> reassign mode for this assignment; absent -> assign mode. */
  assignment?: StationAssignment;
  operadores: StationOperator[];
  estaciones: Estacion[];
  onAssign: (idEmpleado: string, idEstacion: string) => Promise<unknown>;
  onReassign: (assignmentId: string, idEstacion: string) => Promise<unknown>;
  onClose: () => void;
}

const SELECT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al guardar la asignación';
}

export function AsignacionEstacionDialog({
  assignment,
  operadores,
  estaciones,
  onAssign,
  onReassign,
  onClose,
}: AsignacionEstacionDialogProps) {
  const uid = useId();
  const isReassign = !!assignment;
  // Only operators without a current station can be assigned.
  const availableOperators = operadores.filter((o) => !o.idEstacionActual);

  const [idEmpleado, setIdEmpleado] = useState('');
  const [idEstacion, setIdEstacion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stationOptions = isReassign
    ? estaciones.filter((e) => String(e.idEstacion) !== assignment.idEstacion)
    : estaciones;

  const submitDisabled = submitting || !idEstacion || (!isReassign && !idEmpleado);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isReassign) {
        await onReassign(assignment.idAsignacionEstacion, idEstacion);
      } else {
        await onAssign(idEmpleado, idEstacion);
      }
      onClose();
    } catch (err: unknown) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const operatorId = `${uid}-operador`;
  const stationId = `${uid}-estacion`;
  const title = isReassign ? 'Reasignar operador de estación' : 'Asignar operador de estación';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div role="dialog" aria-label={title} className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">{title}</h2>
          {isReassign && (
            <p className="text-sm text-slate-500 mb-4">
              {assignment.nombreEmpleado} - estación actual: {assignment.nombreEstacion}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 mt-4" noValidate>
            {!isReassign && (
              <div>
                <label htmlFor={operatorId} className="block text-sm font-medium text-slate-700 mb-1">
                  Operador
                </label>
                <select id={operatorId} value={idEmpleado} onChange={(e) => setIdEmpleado(e.target.value)} className={SELECT_CLASS}>
                  <option value="">Seleccione un operador</option>
                  {availableOperators.map((o) => (
                    <option key={o.idEmpleado} value={o.idEmpleado}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
                {availableOperators.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">No hay operadores sin estación asignada.</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor={stationId} className="block text-sm font-medium text-slate-700 mb-1">
                Estación
              </label>
              <select id={stationId} value={idEstacion} onChange={(e) => setIdEstacion(e.target.value)} className={SELECT_CLASS}>
                <option value="">Seleccione una estación</option>
                {stationOptions.map((s) => (
                  <option key={s.idEstacion} value={String(s.idEstacion)}>
                    {s.nombreEstacion}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">
                Cancelar
              </button>
              <button type="submit" disabled={submitDisabled} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
                {isReassign ? 'Reasignar' : 'Asignar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
