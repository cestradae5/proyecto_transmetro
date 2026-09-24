import type { Afectacion, Parada, Estacion } from '../../types/infrastructure.types';
import { AfectacionForm } from './afectacion-form';

interface AfectacionDialogProps {
  afectacion?: Afectacion;
  paradas: Parada[];
  estaciones: Estacion[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}

export function AfectacionDialog({ afectacion, paradas, estaciones, onSave, onClose }: AfectacionDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">{afectacion ? 'Editar Afectación' : 'Nueva Afectación'}</h2>
          <AfectacionForm afectacion={afectacion} paradas={paradas} estaciones={estaciones} onSubmit={onSave} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
