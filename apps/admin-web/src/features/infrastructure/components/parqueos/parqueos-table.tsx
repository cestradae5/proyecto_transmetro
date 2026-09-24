import { useState } from 'react';
import type { Parqueo, Estacion } from '../../types/infrastructure.types';
import { ParqueoDialog } from './parqueo-dialog';

interface ParqueosTableProps {
  parqueos: Parqueo[];
  estaciones: Estacion[];
  onUpdate: (id: number, data: any) => Promise<any>;
  onDelete: (id: number) => Promise<any>;
}

export function ParqueosTable({ parqueos, estaciones, onUpdate, onDelete }: ParqueosTableProps) {
  const [search, setSearch] = useState('');
  const [editingParqueo, setEditingParqueo] = useState<Parqueo | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredParqueos = parqueos.filter((p) =>
    p.nombreParqueo.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (parqueo: Parqueo) => {
    setEditingParqueo(parqueo);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Está seguro de eliminar este parqueo?')) {
      await onDelete(id);
    }
  };

  const handleSave = async (data: any) => {
    if (editingParqueo) {
      await onUpdate(editingParqueo.id, data);
    }
    setIsDialogOpen(false);
    setEditingParqueo(null);
  };

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar parqueo..."
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
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Tipo</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Capacidad</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredParqueos.map((parqueo) => (
              <tr key={parqueo.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-900">{parqueo.id}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{parqueo.nombreParqueo}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{parqueo.tipo}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{parqueo.capacidad ?? '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      parqueo.estadoParqueo === 'ABIERTA'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {parqueo.estadoParqueo}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleEdit(parqueo)}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium mr-2"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(parqueo.id)}
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

      {isDialogOpen && editingParqueo && (
        <ParqueoDialog
          parqueo={editingParqueo}
          estaciones={estaciones}
          onSave={handleSave}
          onClose={() => {
            setIsDialogOpen(false);
            setEditingParqueo(null);
          }}
        />
      )}
    </div>
  );
}
