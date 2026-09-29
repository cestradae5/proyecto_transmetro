import { useState } from 'react';
import type { Parada, CreateLineaParadaDto } from '../../types/infrastructure.types';

interface LineaParadaAddFormProps {
  availableParadas: Parada[];
  onAdd: (data: CreateLineaParadaDto) => Promise<void>;
}

export function LineaParadaAddForm({ availableParadas, onAdd }: LineaParadaAddFormProps) {
  const [selectedParada, setSelectedParada] = useState('');
  const [orden, setOrden] = useState('');
  const [minutos, setMinutos] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!selectedParada) {
      newErrors.parada = 'Seleccione una parada';
    }
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
      await onAdd({
        idParada: String(selectedParada),
        orden: parseInt(orden, 10),
        minutosHastaSiguiente: parseInt(minutos, 10),
      });
      setSelectedParada('');
      setOrden('');
      setMinutos('');
      setErrors({});
    } catch (error: any) {
      setErrors({ submit: error.message || 'Error al agregar' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="text-sm font-medium text-slate-700">Agregar parada</div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Parada</label>
          <select
            value={selectedParada}
            onChange={(e) => setSelectedParada(e.target.value)}
            className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Seleccionar</option>
            {availableParadas.map((p) => (
              <option key={p.idParada} value={p.idParada}>
                {p.nombreParada}
              </option>
            ))}
          </select>
          {errors.parada && <p className="text-red-600 text-xs mt-1">{errors.parada}</p>}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Orden</label>
          <input
            type="number"
            min="1"
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.orden && <p className="text-red-600 text-xs mt-1">{errors.orden}</p>}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Minutos</label>
          <input
            type="number"
            min="0"
            value={minutos}
            onChange={(e) => setMinutos(e.target.value)}
            className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.minutos && <p className="text-red-600 text-xs mt-1">{errors.minutos}</p>}
        </div>
      </div>
      {errors.submit && (
        <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
          {errors.submit}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || availableParadas.length === 0}
          className="px-3 py-1 text-sm font-medium text-white bg-primary rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Agregando...' : 'Agregar'}
        </button>
      </div>
      {availableParadas.length === 0 && (
        <p className="text-xs text-slate-500">No hay paradas disponibles para asignar.</p>
      )}
    </form>
  );
}
