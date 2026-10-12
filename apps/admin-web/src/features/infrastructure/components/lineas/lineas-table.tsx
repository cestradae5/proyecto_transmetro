import { useState } from 'react';
import type { Linea, Parada, Parqueo } from '../../types/infrastructure.types';
import { LineaDialog } from './linea-dialog';
import { LineaParadaDialog } from './linea-parada-dialog';

interface LineasTableProps {
  lineas: Linea[];
  parqueos: Parqueo[];
  paradas: Parada[];
  onUpdate: (id: number, data: any) => Promise<any>;
  onDelete: (id: number) => Promise<any>;
}

export function LineasTable({ lineas, parqueos, paradas, onUpdate, onDelete }: LineasTableProps) {
  const [search, setSearch] = useState('');
  const [editingLinea, setEditingLinea] = useState<Linea | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [managingLinea, setManagingLinea] = useState<Linea | null>(null);

  const filteredLineas = lineas.filter((l) =>
    l.nombreLinea.toLowerCase().includes(search.toLowerCase()) || l.numeroLinea.includes(search)
  );

  const getParqueoNombre = (idParqueo: string | null) => {
    if (idParqueo == null) return 'Sin parqueo';
    return parqueos.find((p) => String(p.idParqueo) === String(idParqueo))?.nombreParqueo ?? '—';
  };

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
      await onUpdate(Number(editingLinea.idLinea), data);
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
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Parqueo</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredLineas.map((linea) => (
              <tr key={linea.idLinea} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-900">{linea.idLinea}</td>
                <td className="px-4 py-3 text-sm text-slate-900 font-medium">{linea.numeroLinea}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{linea.nombreLinea}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded" style={{ backgroundColor: linea.colorHex }}></div>
                    <span className="text-xs text-slate-600">{linea.colorHex}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{linea.tipoRecorrido}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{getParqueoNombre(linea.idParqueo)}</td>
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
                    onClick={() => setManagingLinea(linea)}
                    className="px-3 py-1 text-sm text-primary hover:text-primary/80 font-medium mr-2"
                  >
                    Gestionar paradas
                  </button>
                  <button
                    onClick={() => handleDelete(Number(linea.idLinea))}
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

      {managingLinea && (
        <LineaParadaDialog
          linea={managingLinea}
          paradas={paradas}
          onClose={() => setManagingLinea(null)}
        />
      )}
    </div>
  );
}
