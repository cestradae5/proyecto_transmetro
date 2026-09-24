import { useState } from 'react';
import type { Parada } from '../../types/infrastructure.types';
import { ParadaDialog } from './parada-dialog';

interface ParadasTableProps {
  paradas: Parada[];
  onUpdate: (id: number, data: any) => Promise<any>;
  onDelete: (id: number) => Promise<any>;
}

export function ParadasTable({ paradas, onUpdate, onDelete }: ParadasTableProps) {
  const [search, setSearch] = useState('');
  const [editingParada, setEditingParada] = useState<Parada | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredParadas = paradas.filter((p) =>
    p.nombreParada.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (parada: Parada) => {
    setEditingParada(parada);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Está seguro de eliminar esta parada?')) {
      await onDelete(id);
    }
  };

  const handleSave = async (data: any) => {
    if (editingParada) {
      await onUpdate(editingParada.id, data);
    }
    setIsDialogOpen(false);
    setEditingParada(null);
  };

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar parada..."
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
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredParadas.map((parada) => (
              <tr key={parada.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-900">{parada.id}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{parada.nombreParada}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{parada.latitud != null ? Number(parada.latitud).toFixed(6) : '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{parada.longitud != null ? Number(parada.longitud).toFixed(6) : '—'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      parada.estadoParada === 'ACTIVA'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {parada.estadoParada}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleEdit(parada)}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium mr-2"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(parada.id)}
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

      {isDialogOpen && editingParada && (
        <ParadaDialog
          parada={editingParada}
          onSave={handleSave}
          onClose={() => {
            setIsDialogOpen(false);
            setEditingParada(null);
          }}
        />
      )}
    </div>
  );
}
