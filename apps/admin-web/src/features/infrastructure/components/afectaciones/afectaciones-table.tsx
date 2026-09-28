import { useState } from 'react';
import type { Afectacion, Parada, Estacion } from '../../types/infrastructure.types';
import { AfectacionDialog } from './afectacion-dialog';

interface AfectacionesTableProps {
  afectaciones: Afectacion[];
  paradas: Parada[];
  estaciones: Estacion[];
  onUpdate: (id: number, data: any) => Promise<any>;
  onDelete: (id: number) => Promise<any>;
}

export function AfectacionesTable({ afectaciones, paradas, estaciones, onUpdate, onDelete }: AfectacionesTableProps) {
  const [search, setSearch] = useState('');
  const [editingAfectacion, setEditingAfectacion] = useState<Afectacion | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredAfectaciones = afectaciones.filter((a) =>
    a.motivo.toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (afectacion: Afectacion) => {
    setEditingAfectacion(afectacion);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Está seguro de eliminar esta afectación?')) {
      await onDelete(id);
    }
  };

  const handleSave = async (data: any) => {
    if (editingAfectacion) {
      await onUpdate(Number(editingAfectacion.idAfectacion), data);
    }
    setIsDialogOpen(false);
    setEditingAfectacion(null);
  };

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar afectación..."
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
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Tipo</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Motivo</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fecha Inicio</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fecha Fin</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredAfectaciones.map((afectacion) => (
              <tr key={afectacion.idAfectacion} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-900">{afectacion.idAfectacion}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{afectacion.tipoAfectacion}</td>
                <td className="px-4 py-3 text-sm text-slate-900">{afectacion.motivo}</td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {new Date(afectacion.fechaInicio).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {afectacion.fechaFin ? new Date(afectacion.fechaFin).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      afectacion.estadoAfectacion === 'ACTIVA'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {afectacion.estadoAfectacion}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleEdit(afectacion)}
                    className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium mr-2"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(Number(afectacion.idAfectacion))}
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

      {isDialogOpen && editingAfectacion && (
        <AfectacionDialog
          afectacion={editingAfectacion}
          paradas={paradas}
          estaciones={estaciones}
          onSave={handleSave}
          onClose={() => {
            setIsDialogOpen(false);
            setEditingAfectacion(null);
          }}
        />
      )}
    </div>
  );
}
