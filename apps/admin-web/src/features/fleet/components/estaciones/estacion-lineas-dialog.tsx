import { useId, useState } from 'react';
import type { Linea } from '../../../infrastructure/types/infrastructure.types';
import { useEstacionLineas } from '../../hooks/use-estacion-lineas';
import type { EstadoAsignacionEstacion, TipoPuntoEstacionLinea } from '../../types/fleet.types';

interface EstacionLineasDialogProps {
  stationId: string;
  stationName: string;
  lineas: Linea[];
  onClose: () => void;
}

const SELECT_CLASS =
  'px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

const TIPOS_PUNTO: TipoPuntoEstacionLinea[] = ['PRINCIPAL', 'CONTROL', 'APOYO'];
const ESTADOS: EstadoAsignacionEstacion[] = ['ACTIVA', 'INACTIVA'];

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al guardar la línea';
}

export function EstacionLineasDialog({ stationId, stationName, lineas, onClose }: EstacionLineasDialogProps) {
  const uid = useId();
  const { items, loading, error: loadError, refresh, addLine, updateLine, removeLine } = useEstacionLineas(stationId);

  const [idLinea, setIdLinea] = useState('');
  const [tipoPunto, setTipoPunto] = useState<TipoPuntoEstacionLinea>('PRINCIPAL');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lineName = (id: string, fallback?: string) => {
    const linea = lineas.find((l) => l.idLinea === id);
    return linea ? `${linea.numeroLinea} - ${linea.nombreLinea}` : fallback ?? id;
  };

  const linkedIds = new Set(items.map((i) => i.idLinea));
  const availableLines = lineas.filter((l) => !linkedIds.has(l.idLinea));

  const run = async (action: () => Promise<unknown>) => {
    setSubmitting(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err: unknown) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idLinea) return;
    const ok = await run(() => addLine({ idLinea, tipoPunto }));
    if (ok) setIdLinea('');
  };

  const handleRemove = (id: string, label: string) => {
    if (!confirm(`¿Está seguro de quitar la línea ${label} de la estación ${stationName}?`)) return;
    return run(() => removeLine(id));
  };

  const lineSelectId = `${uid}-linea`;
  const tipoSelectId = `${uid}-tipo`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div role="dialog" aria-label="Líneas de la estación" className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Líneas de la estación</h2>
          <p className="text-sm text-slate-500 mb-4">Estación {stationName}</p>

          {loadError ? (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
              <span>{loadError}</span>
              <button type="button" onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
                Reintentar
              </button>
            </div>
          ) : loading && items.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500 mb-4">La estación no tiene líneas asociadas.</p>
          ) : (
            <ul className="mb-4 divide-y divide-slate-100">
              {items.map((item) => {
                const label = lineName(item.idLinea, item.nombreLinea);
                return (
                  <li key={item.idLinea} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Tipo de punto ${label}`}
                        value={item.tipoPunto}
                        disabled={submitting}
                        onChange={(e) => run(() => updateLine(item.idLinea, { tipoPunto: e.target.value as TipoPuntoEstacionLinea }))}
                        className={SELECT_CLASS}
                      >
                        {TIPOS_PUNTO.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <select
                        aria-label={`Estado ${label}`}
                        value={item.estadoAsignacion}
                        disabled={submitting}
                        onChange={(e) => run(() => updateLine(item.idLinea, { estadoAsignacion: e.target.value as EstadoAsignacionEstacion }))}
                        className={SELECT_CLASS}
                      >
                        {ESTADOS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleRemove(item.idLinea, label)}
                        className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3" noValidate>
            <div>
              <label htmlFor={lineSelectId} className="block text-sm font-medium text-slate-700 mb-1">Línea</label>
              <select id={lineSelectId} value={idLinea} onChange={(e) => setIdLinea(e.target.value)} className={SELECT_CLASS}>
                <option value="">Seleccione una línea</option>
                {availableLines.map((l) => (
                  <option key={l.idLinea} value={l.idLinea}>{`${l.numeroLinea} - ${l.nombreLinea}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={tipoSelectId} className="block text-sm font-medium text-slate-700 mb-1">Tipo de punto</label>
              <select id={tipoSelectId} value={tipoPunto} onChange={(e) => setTipoPunto(e.target.value as TipoPuntoEstacionLinea)} className={SELECT_CLASS}>
                {TIPOS_PUNTO.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={submitting || !idLinea} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
              Agregar línea
            </button>
          </form>

          {error && (
            <div role="alert" className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
