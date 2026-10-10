import type { CreateMunicipalidadDto, Municipalidad } from '../../types/infrastructure.types';
import { MunicipalidadForm } from './municipalidad-form';

interface MunicipalidadDialogProps {
  municipalidad?: Municipalidad;
  onSave: (data: CreateMunicipalidadDto) => Promise<void>;
  onClose: () => void;
}

export function MunicipalidadDialog({ municipalidad, onSave, onClose }: MunicipalidadDialogProps) {
  const title = municipalidad ? 'Editar Municipalidad' : 'Nueva Municipalidad';
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div role="dialog" aria-label={title} className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">{title}</h2>
          <MunicipalidadForm municipalidad={municipalidad} onSubmit={onSave} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
