import type { Parqueo, Estacion } from '../../types/infrastructure.types';
import { ParqueoForm } from './parqueo-form';

interface ParqueoDialogProps {
  parqueo?: Parqueo;
  estaciones: Estacion[];
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}

export function ParqueoDialog({ parqueo, estaciones, onSave, onClose }: ParqueoDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">{parqueo ? 'Editar Parqueo' : 'Nuevo Parqueo'}</h2>
          <ParqueoForm parqueo={parqueo} estaciones={estaciones} onSubmit={onSave} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
