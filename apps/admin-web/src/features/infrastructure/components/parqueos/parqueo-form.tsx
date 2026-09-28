import { useState } from 'react';
import type { Parqueo, TipoParqueo, EstadoParqueo, Estacion } from '../../types/infrastructure.types';

interface ParqueoFormProps {
  parqueo?: Parqueo;
  estaciones: Estacion[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function ParqueoForm({ parqueo, estaciones, onSubmit, onCancel }: ParqueoFormProps) {
  const [formData, setFormData] = useState({
    nombreParqueo: parqueo?.nombreParqueo || '',
    tipoParqueo: parqueo?.tipoParqueo || 'CENTRAL' as TipoParqueo,
    direccion: parqueo?.direccion || '',
    latitud: parqueo?.latitud?.toString() || '',
    longitud: parqueo?.longitud?.toString() || '',
    capacidadUnidades: parqueo?.capacidadUnidades?.toString() || '',
    idEstacion: parqueo?.idEstacion?.toString() || '',
    estadoParqueo: parqueo?.estadoParqueo || 'ACTIVO' as EstadoParqueo,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.nombreParqueo.trim()) newErrors.nombreParqueo = 'El nombre es requerido';
    if (!formData.direccion.trim()) newErrors.direccion = 'La dirección es requerida';
    
    const lat = parseFloat(formData.latitud);
    if (isNaN(lat) || lat < -90 || lat > 90) newErrors.latitud = 'Latitud debe estar entre -90 y 90';
    
    const lon = parseFloat(formData.longitud);
    if (isNaN(lon) || lon < -180 || lon > 180) newErrors.longitud = 'Longitud debe estar entre -180 y 180';
    
    const cap = parseInt(formData.capacidadUnidades);
    if (isNaN(cap) || cap < 0) newErrors.capacidadUnidades = 'Capacidad debe ser >= 0';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
       await onSubmit({
         nombreParqueo: formData.nombreParqueo,
         tipoParqueo: formData.tipoParqueo,
         direccion: formData.direccion,
         latitud: parseFloat(formData.latitud),
         longitud: parseFloat(formData.longitud),
         capacidadUnidades: parseInt(formData.capacidadUnidades),
         idEstacion: formData.idEstacion || undefined,
         estadoParqueo: formData.estadoParqueo,
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
        <input type="text" value={formData.nombreParqueo} onChange={(e) => setFormData({ ...formData, nombreParqueo: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
        {errors.nombreParqueo && <p className="text-red-600 text-xs mt-1">{errors.nombreParqueo}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo *</label>
        <select value={formData.tipoParqueo} onChange={(e) => setFormData({ ...formData, tipoParqueo: e.target.value as TipoParqueo })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="CENTRAL">CENTRAL</option>
          <option value="AUXILIAR">AUXILIAR</option>
          <option value="TEMPORAL">TEMPORAL</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Dirección *</label>
        <input type="text" value={formData.direccion} onChange={(e) => setFormData({ ...formData, direccion: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
        {errors.direccion && <p className="text-red-600 text-xs mt-1">{errors.direccion}</p>}
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
        <label className="block text-sm font-medium text-slate-700 mb-1">Capacidad de Unidades *</label>
        <input type="number" min="0" value={formData.capacidadUnidades} onChange={(e) => setFormData({ ...formData, capacidadUnidades: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
        {errors.capacidadUnidades && <p className="text-red-600 text-xs mt-1">{errors.capacidadUnidades}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Estación</label>
        <select value={formData.idEstacion} onChange={(e) => setFormData({ ...formData, idEstacion: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Ninguna</option>
          {estaciones.map((e) => <option key={e.idEstacion} value={e.idEstacion}>{e.nombreEstacion}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
        <select value={formData.estadoParqueo} onChange={(e) => setFormData({ ...formData, estadoParqueo: e.target.value as EstadoParqueo })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="ACTIVO">ACTIVO</option>
          <option value="CERRADO">CERRADO</option>
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
