import { useState } from 'react';
import type { Estacion, Parada } from '../../types/infrastructure.types';
import { EstacionDialog } from './estacion-dialog';

interface EstacionesTableProps {
  estaciones: Estacion[];
  paradas: Parada[];
  onUpdate: (id: number, data: any) => Promise<any>;
  onDelete: (id: number) => Promise<any>;
}

export function EstacionesTable({ estaciones, paradas, onUpdate, onDelete }: EstacionesTableProps) {
  const [search, setSearch] = useState('');
  const [editingEstacion, setEditingEstacion] = useState<Estacion | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredEstaciones = estaciones.filter((e) =>
    e.nombreEstacion.toLowerCase().includes(search.toLowerCase())
  );

  const getParadaNombre = (id: number | null) => {
    if (!id) return '—';
    return paradas.find((p) => p.id === id)?.nombreParada || '—';
  };

  const handleEdit = (estacion: Estacion) => {
    setEditingEstacion(estacion);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Está seguro de eliminar esta estación?')) {
      await onDelete(id);
    }
  };

  const handleSave = async (data: any) => {
    if (editingEstacion) {
      await onUpdate(editingEstacion.id, data);
    }
    setIsDialogOpen(false);
    setEditingEstacion(null);
  };

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar estación..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">ID</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Latitud</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Longitud</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Parada</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredEstaciones.map((estacion) => (
              <tr key={estacion.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-900">{estacion.id}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{estacion.nombreEstacion}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{estacion.latitud != null ? Number(estacion.latitud).toFixed(6) : '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{estacion.longitud != null ? Number(estacion.longitud).toFixed(6) : '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{getParadaNombre(estacion.idParada)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      estacion.estadoEstacion === 'ABIERTA'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {estacion.estadoEstacion}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleEdit(estacion)}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium mr-2"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(estacion.id)}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isDialogOpen && editingEstacion && (
        <EstacionDialog
          estacion={editingEstacion}
          paradas={paradas}
          onSave={handleSave}
          onClose={() => {
            setIsDialogOpen(false);
            setEditingEstacion(null);
          }}
        />
      )}
    </div>
  );
}
