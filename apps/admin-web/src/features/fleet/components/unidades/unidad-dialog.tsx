import type { CreateUnidadDto, Unidad } from '../../types/fleet.types';
import { UnidadForm } from './unidad-form';

interface UnidadDialogProps {
  unidad?: Unidad;
  onSave: (data: CreateUnidadDto) => Promise<void>;
  onClose: () => void;
}

export function UnidadDialog({ unidad, onSave, onClose }: UnidadDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">{unidad ? 'Editar Unidad' : 'Nueva Unidad'}</h2>
          <UnidadForm unidad={unidad} onSubmit={onSave} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
