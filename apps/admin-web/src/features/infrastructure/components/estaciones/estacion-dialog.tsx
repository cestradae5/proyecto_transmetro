import type { Estacion, Parada } from '../../types/infrastructure.types';
import { EstacionForm } from './estacion-form';

interface EstacionDialogProps {
  estacion?: Estacion;
  paradas: Parada[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}

export function EstacionDialog({ estacion, paradas, onSave, onClose }: EstacionDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">{estacion ? 'Editar Estación' : 'Nueva Estación'}</h2>
          <EstacionForm estacion={estacion} paradas={paradas} onSubmit={onSave} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
