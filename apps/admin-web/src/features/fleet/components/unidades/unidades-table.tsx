import { useState } from 'react';
import { EstadoUnidad } from '../../types/fleet.types';
import type { CreateUnidadDto, Piloto, Unidad } from '../../types/fleet.types';
import type { Linea } from '../../../infrastructure/types/infrastructure.types';
import { UnidadDialog } from './unidad-dialog';
import { AsignacionLineaDialog } from './asignacion-linea-dialog';
import { AsignacionPilotoDialog } from './asignacion-piloto-dialog';
import { UbicacionDialog, formatReportDate } from './ubicacion-dialog';

interface UnidadesTableProps {
  unidades: Unidad[];
  /** Lines used to show names and to pick an assignment. Empty if unavailable. */
  lineas?: Linea[];
  /** Pilots used to show names and to pick an assignment. Empty if unavailable. */
  pilotos?: Piloto[];
  /** When false the table is read-only (no actions column). */
  canManage: boolean;
  onUpdate: (id: string, data: CreateUnidadDto) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onAssignLine: (unitId: string, idLinea: string) => Promise<unknown>;
  onReassignLine: (unitId: string, idLinea: string) => Promise<unknown>;
  onUnassignLine: (unitId: string) => Promise<unknown>;
  onAssignPilot: (unitId: string, idEmpleado: string) => Promise<unknown>;
  onReassignPilot: (unitId: string, idEmpleado: string) => Promise<unknown>;
  onUnassignPilot: (unitId: string) => Promise<unknown>;
  onReportLocation: (unitId: string, idLineaParada: string) => Promise<unknown>;
  onCorrectLocation: (unitId: string, idLineaParada: string) => Promise<unknown>;
}

const ESTADO_BADGE: Record<EstadoUnidad, string> = {
  [EstadoUnidad.DISPONIBLE]: 'bg-green-100 text-green-700',
  [EstadoUnidad.EN_SERVICIO]: 'bg-blue-100 text-blue-700',
  [EstadoUnidad.MANTENIMIENTO]: 'bg-amber-100 text-amber-700',
  [EstadoUnidad.FUERA_DE_SERVICIO]: 'bg-red-100 text-red-700',
};

const TH = 'px-4 py-3 text-left text-sm font-semibold text-slate-700';

export function UnidadesTable({
  unidades,
  lineas = [],
  pilotos = [],
  canManage,
  onUpdate,
  onDelete,
  onAssignLine,
  onReassignLine,
  onUnassignLine,
  onAssignPilot,
  onReassignPilot,
  onUnassignPilot,
  onReportLocation,
  onCorrectLocation,
}: UnidadesTableProps) {
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<'' | EstadoUnidad>('');
  const [editingUnidad, setEditingUnidad] = useState<Unidad | null>(null);
  const [assigningUnidad, setAssigningUnidad] = useState<Unidad | null>(null);
  const [assigningPilotoUnidad, setAssigningPilotoUnidad] = useState<Unidad | null>(null);
  const [locatingUnidad, setLocatingUnidad] = useState<Unidad | null>(null);

  const lineaLabel = (idLinea?: string | null) => {
    if (!idLinea) return '-';
    return lineas.find((l) => l.idLinea === idLinea)?.nombreLinea ?? idLinea;
  };
  const pilotoLabel = (idEmpleado?: string | null) => {
    if (!idEmpleado) return '-';
    return pilotos.find((p) => p.idEmpleado === idEmpleado)?.nombre ?? idEmpleado;
  };
  const [actionError, setActionError] = useState<string | null>(null);

  const term = search.trim().toLowerCase();
  const filteredUnidades = unidades.filter((u) => {
    const matchesSearch =
      !term ||
      u.numeroPlaca.toLowerCase().includes(term) ||
      u.marca.toLowerCase().includes(term) ||
      u.modelo.toLowerCase().includes(term);
    const matchesEstado = !estadoFilter || u.estadoUnidad === estadoFilter;
    return matchesSearch && matchesEstado;
  });

  const handleDelete = async (unidad: Unidad) => {
    if (!confirm(`¿Está seguro de dar de baja la unidad ${unidad.numeroPlaca}?`)) return;
    setActionError(null);
    try {
      await onDelete(unidad.idUnidad);
    } catch (error: unknown) {
      setActionError(error instanceof Error && error.message ? error.message : 'Error al dar de baja la unidad');
    }
  };

  // Errors thrown here propagate to the form, which shows them and keeps the dialog open.
  const handleSave = async (data: CreateUnidadDto) => {
    if (!editingUnidad) return;
    await onUpdate(editingUnidad.idUnidad, data);
    setEditingUnidad(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Buscar por placa, marca o modelo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          aria-label="Filtrar por estado"
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value as '' | EstadoUnidad)}
          className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todos los estados</option>
          {Object.values(EstadoUnidad).map((estado) => (
            <option key={estado} value={estado}>{estado}</option>
          ))}
        </select>
      </div>

      {actionError && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {actionError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className={TH}>Placa</th>
              <th className={TH}>Marca / Modelo</th>
              <th className={TH}>Año</th>
              <th className={TH}>Capacidad</th>
              <th className={TH}>Estado</th>
              <th className={TH}>Línea</th>
              <th className={TH}>Piloto</th>
              <th className={TH}>Última parada</th>
              {canManage && <th className={TH}>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filteredUnidades.map((unidad) => (
              <tr key={unidad.idUnidad} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-900 font-medium">{unidad.numeroPlaca}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{unidad.marca} {unidad.modelo}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{unidad.anio}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{unidad.capacidadPasajeros}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${ESTADO_BADGE[unidad.estadoUnidad] ?? 'bg-slate-100 text-slate-700'}`}>
                    {unidad.estadoUnidad}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{lineaLabel(unidad.idLinea)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{pilotoLabel(unidad.idEmpleadoPiloto)}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {/* Stop names are only loaded in the open dialog (no N+1); show the id here. */}
                  <div>{unidad.idLineaParadaActual || '-'}</div>
                  {unidad.idLineaParadaActual && formatReportDate(unidad.fechaReporteUbicacion) && (
                    <div className="text-xs text-slate-500">{formatReportDate(unidad.fechaReporteUbicacion)}</div>
                  )}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditingUnidad(unidad)}
                      className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium mr-2"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => setAssigningUnidad(unidad)}
                      className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 font-medium mr-2"
                    >
                      Línea
                    </button>
                    <button
                      onClick={() => setAssigningPilotoUnidad(unidad)}
                      className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 font-medium mr-2"
                    >
                      Piloto
                    </button>
                    <button
                      onClick={() => setLocatingUnidad(unidad)}
                      disabled={!unidad.idLinea}
                      title={unidad.idLinea ? undefined : 'La unidad no tiene una línea asignada'}
                      className="px-3 py-1 text-sm text-slate-600 hover:text-slate-900 font-medium mr-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Ubicación
                    </button>
                    {unidad.estadoUnidad !== EstadoUnidad.FUERA_DE_SERVICIO && (
                      <button
                        onClick={() => handleDelete(unidad)}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        Dar de baja
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingUnidad && (
        <UnidadDialog unidad={editingUnidad} onSave={handleSave} onClose={() => setEditingUnidad(null)} />
      )}

      {assigningUnidad && (
        <AsignacionLineaDialog
          unit={assigningUnidad}
          lineas={lineas}
          onAssign={onAssignLine}
          onReassign={onReassignLine}
          onUnassign={onUnassignLine}
          onClose={() => setAssigningUnidad(null)}
        />
      )}
      {assigningPilotoUnidad && (
        <AsignacionPilotoDialog
          unit={assigningPilotoUnidad}
          pilotos={pilotos}
          unidades={unidades}
          onAssign={onAssignPilot}
          onReassign={onReassignPilot}
          onUnassign={onUnassignPilot}
          onClose={() => setAssigningPilotoUnidad(null)}
        />
      )}
      {locatingUnidad && (
        <UbicacionDialog
          unit={locatingUnidad}
          onReport={onReportLocation}
          onCorrect={onCorrectLocation}
          onClose={() => setLocatingUnidad(null)}
        />
      )}
    </div>
  );
}
