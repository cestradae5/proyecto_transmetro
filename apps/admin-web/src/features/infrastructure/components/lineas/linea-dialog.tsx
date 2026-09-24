import type { Linea, Parqueo } from '../../types/infrastructure.types';
import { LineaForm } from './linea-form';

interface LineaDialogProps {
  linea?: Linea;
  parqueos: Parqueo[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}

export function LineaDialog({ linea, parqueos, onSave, onClose }: LineaDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">{linea ? 'Editar Línea' : 'Nueva Línea'}</h2>
          <LineaForm linea={linea} parqueos={parqueos} onSubmit={onSave} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
