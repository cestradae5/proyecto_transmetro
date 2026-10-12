import { useId, useState } from 'react';
import { EstadoMunicipalidad, type Linea, type Municipalidad } from '../../types/infrastructure.types';
import { useLineaMunicipalidades } from '../../hooks/use-linea-municipalidades';

interface LineaMunicipalidadesDialogProps {
  linea: Linea;
  municipalidades: Municipalidad[];
  onClose: () => void;
}

const SELECT_CLASS =
  'px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Error al guardar la municipalidad';
}

export function LineaMunicipalidadesDialog({ linea, municipalidades, onClose }: LineaMunicipalidadesDialogProps) {
  const uid = useId();
  const { items, loading, error: loadError, refresh, addMunicipalidad, removeMunicipalidad } =
    useLineaMunicipalidades(linea.idLinea);

  const [idMunicipalidad, setIdMunicipalidad] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ids may arrive as numbers or strings at runtime: compare as strings.
  const municipalidadName = (id: string, fallback?: string) =>
    municipalidades.find((m) => String(m.idMunicipalidad) === String(id))?.nombreMunicipalidad ?? fallback ?? id;

  const linkedIds = new Set(items.map((i) => String(i.idMunicipalidad)));
  const available = municipalidades.filter(
    (m) => m.estadoMunicipalidad === EstadoMunicipalidad.ACTIVA && !linkedIds.has(String(m.idMunicipalidad))
  );

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
    if (!idMunicipalidad) return;
    const ok = await run(() => addMunicipalidad(idMunicipalidad));
    if (ok) setIdMunicipalidad('');
  };

  const handleRemove = (id: string, label: string) => {
    if (!confirm(`¿Está seguro de quitar la municipalidad ${label} de la línea ${linea.nombreLinea}?`)) return;
    return run(() => removeMunicipalidad(id));
  };

  const selectId = `${uid}-municipalidad`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div role="dialog" aria-label="Municipalidades de la línea" className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Municipalidades de la línea</h2>
          <p className="text-sm text-slate-500 mb-4">{`Línea ${linea.numeroLinea} - ${linea.nombreLinea}`}</p>

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
            <p className="text-sm text-slate-500 mb-4">La línea no tiene municipalidades asignadas.</p>
          ) : (
            <ul className="mb-4 divide-y divide-slate-100">
              {items.map((item) => {
                const label = municipalidadName(item.idMunicipalidad, item.nombreMunicipalidad);
                return (
                  <li key={item.idMunicipalidad} className="py-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleRemove(item.idMunicipalidad, label)}
                      className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3" noValidate>
            <div>
              <label htmlFor={selectId} className="block text-sm font-medium text-slate-700 mb-1">Municipalidad</label>
              <select id={selectId} value={idMunicipalidad} onChange={(e) => setIdMunicipalidad(e.target.value)} className={SELECT_CLASS}>
                <option value="">Seleccione una municipalidad</option>
                {available.map((m) => (
                  <option key={m.idMunicipalidad} value={m.idMunicipalidad}>{`${m.nombreMunicipalidad} (${m.departamento})`}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={submitting || !idMunicipalidad} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">
              Agregar municipalidad
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
