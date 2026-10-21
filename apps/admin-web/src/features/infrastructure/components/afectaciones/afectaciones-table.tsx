import { useState } from 'react';
import {
  AccionAfectacion,
  type Afectacion,
  type AfectacionCambio,
  type Estacion,
  type Linea,
  type Municipalidad,
  type Parada,
} from '../../types/infrastructure.types';

interface AfectacionesTableProps {
  afectaciones: Afectacion[];
  municipalidades: Municipalidad[];
  lineas: Linea[];
  paradas: Parada[];
  estaciones: Estacion[];
  onEdit: (afectacion: Afectacion) => void;
}

type EntidadTipo = AfectacionCambio['entidadTipo'];

const ACCION_BADGES: Record<string, { label: string; className: string }> = {
  [AccionAfectacion.ACTIVAR]: { label: 'Activar', className: 'bg-green-100 text-green-700' },
  [AccionAfectacion.DESACTIVAR]: { label: 'Desactivar', className: 'bg-red-100 text-red-700' },
};

// Reads the calendar date from the string itself: new Date('YYYY-MM-DD') is UTC
// midnight and would show the previous day in Guatemala.
function formatFecha(fecha: string | null) {
  if (!fecha) return '—';
  const [year, month, day] = fecha.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/**
 * History of afectaciones (newest first, as returned by the API). Rows can be
 * edited (acción, motivo, fechas) but not deleted.
 */
export function AfectacionesTable({
  afectaciones,
  municipalidades,
  lineas,
  paradas,
  estaciones,
  onEdit,
}: AfectacionesTableProps) {
  const [search, setSearch] = useState('');

  const filteredAfectaciones = afectaciones.filter((a) => a.motivo.toLowerCase().includes(search.toLowerCase()));

  const entityName = (tipo: EntidadTipo, rawId: string | number) => {
    const id = String(rawId);
    switch (tipo) {
      case 'municipalidad':
        return `Municipalidad: ${municipalidades.find((m) => String(m.idMunicipalidad) === id)?.nombreMunicipalidad ?? `#${id}`}`;
      case 'linea': {
        const linea = lineas.find((l) => String(l.idLinea) === id);
        return `Línea: ${linea ? `${linea.numeroLinea} - ${linea.nombreLinea}` : `#${id}`}`;
      }
      case 'parada':
        return `Parada: ${paradas.find((p) => String(p.idParada) === id)?.nombreParada ?? `#${id}`}`;
      case 'estacion':
        return `Estación: ${estaciones.find((e) => String(e.idEstacion) === id)?.nombreEstacion ?? `#${id}`}`;
    }
  };

  const targetOf = (afectacion: Afectacion): { tipo: EntidadTipo; id: string } | null => {
    if (afectacion.idMunicipalidad != null) return { tipo: 'municipalidad', id: String(afectacion.idMunicipalidad) };
    if (afectacion.idLinea != null) return { tipo: 'linea', id: String(afectacion.idLinea) };
    if (afectacion.idParada != null) return { tipo: 'parada', id: String(afectacion.idParada) };
    if (afectacion.idEstacion != null) return { tipo: 'estacion', id: String(afectacion.idEstacion) };
    return null;
  };

  // Everything the afectación changed besides its own target.
  const cascadeOf = (afectacion: Afectacion) => {
    const target = targetOf(afectacion);
    return (afectacion.cambios ?? []).filter(
      (c) => !(target && c.entidadTipo === target.tipo && String(c.entidadId) === target.id),
    );
  };

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por motivo..."
          aria-label="Buscar afectación por motivo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fecha inicio</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fecha fin</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acción</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Afecta a</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Motivo</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {afectaciones.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">No hay afectaciones registradas.</td>
              </tr>
            )}
            {filteredAfectaciones.map((afectacion) => {
              // Legacy rows may carry old types (TEMPORAL...): shown as-is.
              const badge = ACCION_BADGES[afectacion.accion] ?? {
                label: afectacion.accion,
                className: 'bg-slate-100 text-slate-700',
              };
              const target = targetOf(afectacion);
              const targetName = target ? entityName(target.tipo, target.id) : '—';
              const cascade = cascadeOf(afectacion);
              return (
                <tr key={afectacion.idAfectacion} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-600">{formatFecha(afectacion.fechaInicio)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatFecha(afectacion.fechaFin)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900">
                    <div>{targetName}</div>
                    {cascade.length > 0 && (
                      <details className="mt-1 text-xs text-slate-600">
                        <summary className="cursor-pointer text-primary">{`+${cascade.length} en cascada`}</summary>
                        <ul className="mt-1 space-y-0.5">
                          {cascade.map((c) => {
                            const text = `${entityName(c.entidadTipo, c.entidadId)}: ${c.estadoAnterior} → ${c.estadoNuevo}`;
                            return (
                              <li key={`${c.entidadTipo}-${c.entidadId}`}>
                                {c.revertido ? (
                                  <>
                                    <s>{text}</s> <span className="text-slate-500">(revertido)</span>
                                  </>
                                ) : (
                                  text
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900">{afectacion.motivo}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(afectacion)}
                      aria-label={`Editar afectación ${targetName} del ${formatFecha(afectacion.fechaInicio)}`}
                      className="px-3 py-1 text-sm font-medium text-primary rounded-lg hover:bg-primary/10"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
