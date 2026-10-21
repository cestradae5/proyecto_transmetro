import { useState } from 'react';
import { AccionAfectacion, type Afectacion, type Estacion, type Linea, type Parada } from '../../types/infrastructure.types';

interface AfectacionesTableProps {
  afectaciones: Afectacion[];
  lineas: Linea[];
  paradas: Parada[];
  estaciones: Estacion[];
}

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

/** Read-only history of afectaciones (newest first, as returned by the API). */
export function AfectacionesTable({ afectaciones, lineas, paradas, estaciones }: AfectacionesTableProps) {
  const [search, setSearch] = useState('');

  const filteredAfectaciones = afectaciones.filter((a) => a.motivo.toLowerCase().includes(search.toLowerCase()));

  const targetName = (afectacion: Afectacion) => {
    if (afectacion.idLinea != null) {
      const id = String(afectacion.idLinea);
      const linea = lineas.find((l) => String(l.idLinea) === id);
      return `Línea: ${linea ? `${linea.numeroLinea} - ${linea.nombreLinea}` : `#${id}`}`;
    }
    if (afectacion.idParada != null) {
      const id = String(afectacion.idParada);
      return `Parada: ${paradas.find((p) => String(p.idParada) === id)?.nombreParada ?? `#${id}`}`;
    }
    if (afectacion.idEstacion != null) {
      const id = String(afectacion.idEstacion);
      return `Estación: ${estaciones.find((e) => String(e.idEstacion) === id)?.nombreEstacion ?? `#${id}`}`;
    }
    return '—';
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
            </tr>
          </thead>
          <tbody>
            {afectaciones.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">No hay afectaciones registradas.</td>
              </tr>
            )}
            {filteredAfectaciones.map((afectacion) => {
              // Legacy rows may carry old types (TEMPORAL...): shown as-is.
              const badge = ACCION_BADGES[afectacion.accion] ?? {
                label: afectacion.accion,
                className: 'bg-slate-100 text-slate-700',
              };
              return (
                <tr key={afectacion.idAfectacion} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-600">{formatFecha(afectacion.fechaInicio)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatFecha(afectacion.fechaFin)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900">{targetName(afectacion)}</td>
                  <td className="px-4 py-3 text-sm text-slate-900">{afectacion.motivo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
