import { useEffect, useMemo } from 'react';
import type { Linea, Parada } from '../../types/infrastructure.types';
import { useLineaParadas } from '../../hooks/use-linea-paradas';
import { LineaParadaTable } from './linea-parada-table';
import { LineaParadaAddForm } from './linea-parada-add-form';

interface LineaParadaDialogProps {
  linea: Linea;
  paradas: Parada[];
  onClose: () => void;
}

export function LineaParadaDialog({ linea, paradas, onClose }: LineaParadaDialogProps) {
  const { lineaParadas, loading, error, addParada, updateParada, removeParada } = useLineaParadas(
    linea.idLinea
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const availableParadas = useMemo(() => {
    const assignedIds = new Set(lineaParadas.map((lp) => lp.idParada));
    return paradas.filter((p) => !assignedIds.has(String(p.idParada)));
  }, [paradas, lineaParadas]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900">
              Gestionar paradas: {linea.nombreLinea}
            </h2>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="mb-4">
            <LineaParadaTable
              lineaParadas={lineaParadas}
              loading={loading}
              onUpdate={updateParada}
              onRemove={removeParada}
            />
          </div>

          <LineaParadaAddForm
            availableParadas={availableParadas}
            onAdd={async (data) => {
              await addParada(data);
            }}
          />

          <div className="flex justify-end mt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
