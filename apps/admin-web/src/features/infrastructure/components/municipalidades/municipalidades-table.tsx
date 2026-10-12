import { useState } from 'react';
import {
  EstadoMunicipalidad,
  type CreateMunicipalidadDto,
  type Municipalidad,
} from '../../types/infrastructure.types';
import { MunicipalidadDialog } from './municipalidad-dialog';

interface MunicipalidadesTableProps {
  municipalidades: Municipalidad[];
  onUpdate: (id: string, data: CreateMunicipalidadDto) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

export function MunicipalidadesTable({ municipalidades, onUpdate, onDelete }: MunicipalidadesTableProps) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Municipalidad | null>(null);
  const [error, setError] = useState<string | null>(null);

  const term = search.toLowerCase();
  const filtered = municipalidades.filter(
    (m) => m.nombreMunicipalidad.toLowerCase().includes(term) || m.departamento.toLowerCase().includes(term)
  );

  // Delete is a soft delete on the API (estado -> INACTIVA), hence "Desactivar".
  const handleDeactivate = async (municipalidad: Municipalidad) => {
    if (!confirm(`¿Está seguro de desactivar la municipalidad ${municipalidad.nombreMunicipalidad}?`)) return;
    setError(null);
    try {
      await onDelete(municipalidad.idMunicipalidad);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Error al desactivar la municipalidad');
    }
  };

  const handleSave = async (data: CreateMunicipalidadDto) => {
    if (editing) {
      await onUpdate(editing.idMunicipalidad, data);
    }
    setEditing(null);
  };

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar municipalidad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Departamento</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((municipalidad) => {
              const activa = municipalidad.estadoMunicipalidad === EstadoMunicipalidad.ACTIVA;
              return (
                <tr key={municipalidad.idMunicipalidad} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-900">{municipalidad.nombreMunicipalidad}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{municipalidad.departamento}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        activa ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {municipalidad.estadoMunicipalidad}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditing(municipalidad)}
                      className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium mr-2"
                    >
                      Editar
                    </button>
                    {activa && (
                      <button
                        onClick={() => handleDeactivate(municipalidad)}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        Desactivar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">No hay municipalidades registradas.</p>
        )}
      </div>

      {editing && (
        <MunicipalidadDialog municipalidad={editing} onSave={handleSave} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
