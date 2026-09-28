import { useState } from 'react';
import type { Estacion, EstadoInfraestructura, Parada } from '../../types/infrastructure.types';

interface EstacionFormProps {
  estacion?: Estacion;
  paradas: Parada[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function EstacionForm({ estacion, paradas, onSubmit, onCancel }: EstacionFormProps) {
  const [formData, setFormData] = useState({
    nombreEstacion: estacion?.nombreEstacion || '',
    latitud: estacion?.latitud?.toString() || '',
    longitud: estacion?.longitud?.toString() || '',
    idParada: estacion?.idParada?.toString() || '',
    estadoEstacion: estacion?.estadoEstacion || 'ACTIVA' as EstadoInfraestructura,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.nombreEstacion.trim()) newErrors.nombreEstacion = 'El nombre es requerido';
    const lat = parseFloat(formData.latitud);
    if (isNaN(lat) || lat < -90 || lat > 90) newErrors.latitud = 'Latitud debe estar entre -90 y 90';
    const lon = parseFloat(formData.longitud);
    if (isNaN(lon) || lon < -180 || lon > 180) newErrors.longitud = 'Longitud debe estar entre -180 y 180';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
       await onSubmit({
         nombreEstacion: formData.nombreEstacion,
         latitud: parseFloat(formData.latitud),
         longitud: parseFloat(formData.longitud),
         idParada: formData.idParada ? parseInt(formData.idParada) : null,
         estadoEstacion: formData.estadoEstacion,
       });
    } catch (error: any) {
      setErrors({ submit: error.message || 'Error al guardar' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
        <input type="text" value={formData.nombreEstacion} onChange={(e) => setFormData({ ...formData, nombreEstacion: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
        {errors.nombreEstacion && <p className="text-red-600 text-xs mt-1">{errors.nombreEstacion}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Latitud *</label>
          <input type="number" step="0.000001" value={formData.latitud} onChange={(e) => setFormData({ ...formData, latitud: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          {errors.latitud && <p className="text-red-600 text-xs mt-1">{errors.latitud}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Longitud *</label>
          <input type="number" step="0.000001" value={formData.longitud} onChange={(e) => setFormData({ ...formData, longitud: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          {errors.longitud && <p className="text-red-600 text-xs mt-1">{errors.longitud}</p>}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Parada</label>
        <select value={formData.idParada} onChange={(e) => setFormData({ ...formData, idParada: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Ninguna</option>
          {paradas.map((p) => <option key={p.idParada} value={p.idParada}>{p.nombreParada}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
        <select value={formData.estadoEstacion} onChange={(e) => setFormData({ ...formData, estadoEstacion: e.target.value as EstadoInfraestructura })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="ACTIVA">ACTIVA</option>
          <option value="CERRADA">CERRADA</option>
          <option value="MANTENIMIENTO">MANTENIMIENTO</option>
        </select>
      </div>
      {errors.submit && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{errors.submit}</div>}
      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancelar</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">{submitting ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </form>
  );
}
