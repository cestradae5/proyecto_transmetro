import { useState } from 'react';
import type { Linea, Parqueo } from '../../types/infrastructure.types';
import { LineaDialog } from './linea-dialog';

interface LineasTableProps {
  lineas: Linea[];
  parqueos: Parqueo[];
  onUpdate: (id: number, data: any) => Promise<any>;
  onDelete: (id: number) => Promise<any>;
}

export function LineasTable({ lineas, parqueos, onUpdate, onDelete }: LineasTableProps) {
  const [search, setSearch] = useState('');
  const [editingLinea, setEditingLinea] = useState<Linea | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredLineas = lineas.filter((l) =>
    l.nombreLinea.toLowerCase().includes(search.toLowerCase()) || l.numero.includes(search)
  );

  const handleEdit = (linea: Linea) => {
    setEditingLinea(linea);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Está seguro de eliminar esta línea?')) {
      await onDelete(id);
    }
  };

  const handleSave = async (data: any) => {
    if (editingLinea) {
      await onUpdate(editingLinea.id, data);
    }
    setIsDialogOpen(false);
    setEditingLinea(null);
  };

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar línea..."
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
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Número</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Nombre</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Color</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Tipo</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredLineas.map((linea) => (
              <tr key={linea.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-900">{linea.id}</td>
                <td className="px-4 py-3 text-sm text-slate-900 font-medium">{linea.numero}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{linea.nombreLinea}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded" style={{ backgroundColor: linea.color_hex }}></div>
                    <span className="text-xs text-slate-600">{linea.color_hex}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{linea.tipo_recorrido}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      linea.estadoLinea === 'ACTIVA'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {linea.estadoLinea}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleEdit(linea)}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium mr-2"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(linea.id)}
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

      {isDialogOpen && editingLinea && (
        <LineaDialog
          linea={editingLinea}
          parqueos={parqueos}
          onSave={handleSave}
          onClose={() => {
            setIsDialogOpen(false);
            setEditingLinea(null);
          }}
        />
      )}
    </div>
  );
}
