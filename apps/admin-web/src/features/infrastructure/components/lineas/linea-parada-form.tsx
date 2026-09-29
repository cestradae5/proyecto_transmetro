import { useState } from 'react';
import type { LineaParada, UpdateLineaParadaDto } from '../../types/infrastructure.types';

interface LineaParadaFormProps {
  lineaParada: LineaParada;
  onSave: (data: UpdateLineaParadaDto) => Promise<void>;
  onCancel: () => void;
}

export function LineaParadaForm({ lineaParada, onSave, onCancel }: LineaParadaFormProps) {
  const [orden, setOrden] = useState(lineaParada.orden.toString());
  const [minutos, setMinutos] = useState(lineaParada.minutosHastaSiguiente.toString());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const ordenNum = parseInt(orden, 10);
    if (isNaN(ordenNum) || ordenNum <= 0) {
      newErrors.orden = 'El orden debe ser un número mayor a 0';
    }
    const minutosNum = parseInt(minutos, 10);
    if (isNaN(minutosNum) || minutosNum < 0) {
      newErrors.minutos = 'Los minutos deben ser un número mayor o igual a 0';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSave({
        orden: parseInt(orden, 10),
        minutosHastaSiguiente: parseInt(minutos, 10),
      });
    } catch (error: any) {
      setErrors({ submit: error.message || 'Error al guardar' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <label className="text-xs text-slate-500">Orden</label>
        <input
          type="number"
          min="1"
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          className="w-16 px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-xs text-slate-500">Min</label>
        <input
          type="number"
          min="0"
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
          className="w-16 px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      {errors.orden && <p className="text-red-600 text-xs">{errors.orden}</p>}
      {errors.minutos && <p className="text-red-600 text-xs">{errors.minutos}</p>}
      {errors.submit && <p className="text-red-600 text-xs">{errors.submit}</p>}
      <div className="flex gap-1 ml-auto">
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 rounded hover:bg-slate-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-2 py-1 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? '...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
