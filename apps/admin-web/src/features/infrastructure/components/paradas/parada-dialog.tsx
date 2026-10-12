import type { Estacion, Parada, ParadaFormValues } from '../../types/infrastructure.types';
import { ParadaForm } from './parada-form';

interface ParadaDialogProps {
  parada?: Parada;
  estacion?: Estacion;
  onSave: (values: ParadaFormValues) => Promise<void>;
  onClose: () => void;
}

export function ParadaDialog({ parada, estacion, onSave, onClose }: ParadaDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            {parada ? 'Editar Parada' : 'Nueva Parada'}
          </h2>
          <ParadaForm parada={parada} estacion={estacion} onSubmit={onSave} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
