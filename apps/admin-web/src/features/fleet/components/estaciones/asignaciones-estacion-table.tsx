import { useState } from 'react';
import type { Estacion, Linea } from '../../../infrastructure/types/infrastructure.types';
import type { StationAssignment, StationOperator } from '../../types/fleet.types';
import { formatReportDate } from '../../utils/format';
import { AsignacionEstacionDialog } from './asignacion-estacion-dialog';
import { EstacionLineasDialog } from './estacion-lineas-dialog';

interface AsignacionesEstacionTableProps {
  assignments: StationAssignment[];
  operadores: StationOperator[];
  estaciones: Estacion[];
  lineas: Linea[];
  canManage: boolean;
  onAssign: (idEmpleado: string, idEstacion: string) => Promise<unknown>;
  onReassign: (assignmentId: string, idEstacion: string) => Promise<unknown>;
  onUnassign: (assignmentId: string) => Promise<unknown>;
}

type DialogState =
  | { kind: 'assign' }
  | { kind: 'reassign'; assignment: StationAssignment }
  | { kind: 'lines'; assignment: StationAssignment }
  | null;

export function AsignacionesEstacionTable({
  assignments,
  operadores,
  estaciones,
  lineas,
  canManage,
  onAssign,
  onReassign,
  onUnassign,
}: AsignacionesEstacionTableProps) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const close = () => setDialog(null);

  const handleUnassign = async (assignment: StationAssignment) => {
    if (!confirm(`¿Está seguro de quitar a ${assignment.nombreEmpleado} de la estación ${assignment.nombreEstacion}?`)) return;
    setActionError(null);
    try {
      await onUnassign(assignment.idAsignacionEstacion);
    } catch (err: unknown) {
      setActionError(err instanceof Error && err.message ? err.message : 'Error al quitar la asignación');
    }
  };

  return (
    <div>
      {canManage && (
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={() => setDialog({ kind: 'assign' })}
            className="px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
          >
            Asignar operador
          </button>
        </div>
      )}

      {actionError && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {actionError}
        </div>
      )}

      {assignments.length === 0 ? (
        <p className="py-8 text-center text-slate-500">No hay operadores asignados a estaciones.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 pr-4 font-medium">Operador</th>
                <th className="py-2 pr-4 font-medium">Estación</th>
                <th className="py-2 pr-4 font-medium">Fecha</th>
                <th className="py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.idAsignacionEstacion} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-900">{a.nombreEmpleado}</td>
                  <td className="py-2 pr-4 text-slate-700">{a.nombreEstacion}</td>
                  <td className="py-2 pr-4 text-slate-700">{formatReportDate(a.fechaAsignacion) ?? '-'}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: 'lines', assignment: a })}
                            className="px-3 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                          >
                            Líneas
                          </button>
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: 'reassign', assignment: a })}
                            className="px-3 py-1 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20"
                          >
                            Reasignar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUnassign(a)}
                            className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
                          >
                            Quitar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && dialog?.kind === 'assign' && (
        <AsignacionEstacionDialog
          operadores={operadores}
          estaciones={estaciones}
          onAssign={onAssign}
          onReassign={onReassign}
          onClose={close}
        />
      )}
      {canManage && dialog?.kind === 'reassign' && (
        <AsignacionEstacionDialog
          assignment={dialog.assignment}
          operadores={operadores}
          estaciones={estaciones}
          onAssign={onAssign}
          onReassign={onReassign}
          onClose={close}
        />
      )}
      {canManage && dialog?.kind === 'lines' && (
        <EstacionLineasDialog
          stationId={dialog.assignment.idEstacion}
          stationName={dialog.assignment.nombreEstacion}
          lineas={lineas}
          onClose={close}
        />
      )}
    </div>
  );
}
