import { useState } from 'react';
import type { LineaParada, UpdateLineaParadaDto } from '../../types/infrastructure.types';
import { LineaParadaForm } from './linea-parada-form';

const MIN_PARADAS = 2;

interface LineaParadaTableProps {
  lineaParadas: LineaParada[];
  loading: boolean;
  onUpdate: (lineaParadaId: string, data: UpdateLineaParadaDto) => Promise<LineaParada>;
  onRemove: (lineaParadaId: string) => Promise<void>;
}

export function LineaParadaTable({ lineaParadas, loading, onUpdate, onRemove }: LineaParadaTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (loading) {
    return <div className="py-8 text-center text-sm text-slate-500">Cargando paradas...</div>;
  }

  if (lineaParadas.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-500">No hay paradas asignadas</div>;
  }

  const sorted = [...lineaParadas].sort((a, b) => a.orden - b.orden);
  const canRemove = sorted.length > MIN_PARADAS;

  const handleRemove = async (lineaParadaId: string) => {
    if (!confirm('¿Eliminar esta parada?')) return;
    setRemoveError(null);
    try {
      await onRemove(lineaParadaId);
    } catch (error: any) {
      setRemoveError(error.message || 'Error al eliminar la parada');
    }
  };

  return (
    <div>
      {removeError && (
        <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
          {removeError}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Parada</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Orden</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Min. siguiente</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((lineaParada) => {
              const isEditing = editingId === lineaParada.idLineaParada;
              return (
                <tr key={lineaParada.idLineaParada} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 text-sm text-slate-900">{lineaParada.parada.nombreParada}</td>
                  {isEditing ? (
                    <td className="px-4 py-2" colSpan={4}>
                      <LineaParadaForm
                        lineaParada={lineaParada}
                        onSave={async (data) => {
                          await onUpdate(lineaParada.idLineaParada, data);
                          setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-sm text-slate-600">{lineaParada.orden}</td>
                      <td className="px-4 py-2 text-sm text-slate-600">{lineaParada.minutosHastaSiguiente}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            lineaParada.parada.estadoParada === 'ACTIVA'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {lineaParada.parada.estadoParada}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => setEditingId(lineaParada.idLineaParada)}
                          className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 font-medium mr-2"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleRemove(lineaParada.idLineaParada)}
                          disabled={!canRemove}
                          aria-label={
                            canRemove ? undefined : 'Una línea debe tener al menos 2 paradas'
                          }
                          title={canRemove ? undefined : 'Una línea debe tener al menos 2 paradas'}
                          className="px-2 py-1 text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-red-600"
                        >
                          Eliminar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
