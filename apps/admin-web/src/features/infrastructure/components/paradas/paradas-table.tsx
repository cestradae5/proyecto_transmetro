import { useState } from 'react';
import type { Estacion, Linea, Parada, ParadaFormValues } from '../../types/infrastructure.types';
import { EstacionLineasDialog } from '../../../fleet/components/estaciones/estacion-lineas-dialog';
import { ParadaDialog } from './parada-dialog';
import { AccesosDialog } from './accesos-dialog';

interface ParadasTableProps {
  paradas: Parada[];
  estaciones: Estacion[];
  lineas: Linea[];
  onSave: (paradaId: number | string, values: ParadaFormValues) => Promise<void>;
  onDelete: (id: number | string) => Promise<any>;
}

export function ParadasTable({ paradas, estaciones, lineas, onSave, onDelete }: ParadasTableProps) {
  const [search, setSearch] = useState('');
  const [editingParada, setEditingParada] = useState<Parada | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [linesParada, setLinesParada] = useState<Parada | null>(null);
  const [accesosParada, setAccesosParada] = useState<Parada | null>(null);

  const filteredParadas = paradas.filter((p) =>
    p.nombreParada.toLowerCase().includes(search.toLowerCase())
  );

  // Ids arrive as strings at runtime even where the type says number.
  const findEstacion = (parada: Parada) =>
    parada.idEstacion == null
      ? undefined
      : estaciones.find((e) => String(e.idEstacion) === String(parada.idEstacion));

  const handleEdit = (parada: Parada) => {
    setEditingParada(parada);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('¿Está seguro de eliminar esta parada?')) {
      await onDelete(id);
    }
  };

  const handleSave = async (values: ParadaFormValues) => {
    if (editingParada) {
      await onSave(editingParada.idParada, values);
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
              <tr key={parada.idParada} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-sm text-slate-900">{parada.idParada}</td>
                <td className="px-4 py-3 text-sm text-slate-900">
                  <div className="flex items-center gap-2">
                    <span>{parada.nombreParada}</span>
                    {parada.esEstacion && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700">
                        Estación
                      </span>
                    )}
                  </div>
                </td>
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
                    onClick={() => setAccesosParada(parada)}
                    className="px-3 py-1 text-sm text-primary hover:text-primary/80 font-medium mr-2"
                  >
                    Accesos
                  </button>
                  {parada.esEstacion && parada.idEstacion != null && (
                    <button
                      onClick={() => setLinesParada(parada)}
                      className="px-3 py-1 text-sm text-primary hover:text-primary/80 font-medium mr-2"
                    >
                      Líneas de la estación
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(parada.idParada)}
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
          estacion={findEstacion(editingParada)}
          onSave={handleSave}
          onClose={() => {
            setIsDialogOpen(false);
            setEditingParada(null);
          }}
        />
      )}

      {linesParada && linesParada.idEstacion != null && (
        <EstacionLineasDialog
          stationId={String(linesParada.idEstacion)}
          stationName={findEstacion(linesParada)?.nombreEstacion ?? linesParada.nombreParada}
          lineas={lineas}
          onClose={() => setLinesParada(null)}
        />
      )}

      {accesosParada && <AccesosDialog parada={accesosParada} onClose={() => setAccesosParada(null)} />}
    </div>
  );
}
