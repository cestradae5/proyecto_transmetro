import { useId } from 'react';
import type {
  Afectacion,
  CreateAfectacionDto,
  Estacion,
  Linea,
  Municipalidad,
  Parada,
  UpdateAfectacionDto,
} from '../../types/infrastructure.types';
import { AfectacionForm } from './afectacion-form';

interface AfectacionDialogProps {
  municipalidades: Municipalidad[];
  lineas: Linea[];
  paradas: Parada[];
  estaciones: Estacion[];
  /** Edit mode when set; creates otherwise. */
  afectacion?: Afectacion;
  onSave: (data: CreateAfectacionDto | UpdateAfectacionDto) => Promise<void>;
  onClose: () => void;
}

export function AfectacionDialog({
  municipalidades,
  lineas,
  paradas,
  estaciones,
  afectacion,
  onSave,
  onClose,
}: AfectacionDialogProps) {
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
          <h2 id={titleId} className="text-xl font-bold text-slate-900 mb-4">
            {afectacion ? 'Editar Afectación' : 'Nueva Afectación'}
          </h2>
          <AfectacionForm
            municipalidades={municipalidades}
            lineas={lineas}
            paradas={paradas}
            estaciones={estaciones}
            afectacion={afectacion}
            onSubmit={onSave}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
