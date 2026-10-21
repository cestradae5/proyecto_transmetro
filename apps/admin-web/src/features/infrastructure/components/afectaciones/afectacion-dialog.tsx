import { useId } from 'react';
import type { CreateAfectacionDto, Estacion, Linea, Parada } from '../../types/infrastructure.types';
import { AfectacionForm } from './afectacion-form';

interface AfectacionDialogProps {
  lineas: Linea[];
  paradas: Parada[];
  estaciones: Estacion[];
  onSave: (data: CreateAfectacionDto) => Promise<void>;
  onClose: () => void;
}

// Afectaciones are an immutable history: the dialog only creates.
export function AfectacionDialog({ lineas, paradas, estaciones, onSave, onClose }: AfectacionDialogProps) {
  const titleId = useId();
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <h2 id={titleId} className="text-xl font-bold text-slate-900 mb-4">Nueva Afectación</h2>
          <AfectacionForm lineas={lineas} paradas={paradas} estaciones={estaciones} onSubmit={onSave} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
