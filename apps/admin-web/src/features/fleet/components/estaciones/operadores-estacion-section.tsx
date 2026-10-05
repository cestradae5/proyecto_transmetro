import { useEstaciones } from '../../../infrastructure/hooks/use-estaciones';
import { useLineas } from '../../../infrastructure/hooks/use-lineas';
import { useAsignacionEstacion } from '../../hooks/use-asignacion-estacion';
import { useOperadoresEstacion } from '../../hooks/use-operadores-estacion';
import { AsignacionesEstacionTable } from './asignaciones-estacion-table';

interface OperadoresEstacionSectionProps {
  canManage: boolean;
}

/** "Operadores de estación" tab: hooks mount (and fetch) only when the tab is opened. */
export function OperadoresEstacionSection({ canManage }: OperadoresEstacionSectionProps) {
  const { items, loading, error, refresh, assign, reassign, unassign } = useAsignacionEstacion();
  const { items: operadores, error: operadoresError, refresh: refreshOperadores } = useOperadoresEstacion();
  const { estaciones, error: estacionesError } = useEstaciones();
  const { lineas, error: lineasError } = useLineas();

  // Assignment hook refreshes its own list; operators' current station must be refreshed too.
  const handleAssign = async (idEmpleado: string, idEstacion: string) => {
    await assign(idEmpleado, idEstacion);
    await refreshOperadores();
  };

  const handleReassign = async (assignmentId: string, idEstacion: string) => {
    await reassign(assignmentId, idEstacion);
    await refreshOperadores();
  };

  const handleUnassign = async (assignmentId: string) => {
    await unassign(assignmentId);
    await refreshOperadores();
  };

  const warnings: string[] = [];
  if (operadoresError) warnings.push(`No se pudieron cargar los operadores: ${operadoresError}.`);
  if (estacionesError) warnings.push(`No se pudieron cargar las estaciones: ${estacionesError}.`);
  if (lineasError) warnings.push(`No se pudieron cargar las líneas: ${lineasError}.`);

  return (
    <div>
      {warnings.map((message) => (
        <div key={message} role="status" className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          {message}
        </div>
      ))}

      {error && items.length > 0 && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          No se pudo actualizar la lista: {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-500">Cargando...</div>
        </div>
      ) : error && items.length === 0 ? (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
            Reintentar
          </button>
        </div>
      ) : (
        <AsignacionesEstacionTable
          assignments={items}
          operadores={operadores}
          estaciones={estaciones}
          lineas={lineas}
          canManage={canManage}
          onAssign={handleAssign}
          onReassign={handleReassign}
          onUnassign={handleUnassign}
        />
      )}
    </div>
  );
}
