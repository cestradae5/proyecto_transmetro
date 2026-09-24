import { useState } from 'react';
import type { Linea, TipoRecorrido, EstadoInfraestructura, Parqueo } from '../../types/infrastructure.types';

interface LineaFormProps {
  linea?: Linea;
  parqueos: Parqueo[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function LineaForm({ linea, parqueos, onSubmit, onCancel }: LineaFormProps) {
  const [formData, setFormData] = useState({
    numero: linea?.numero || '',
    nombreLinea: linea?.nombreLinea || '',
    color_hex: linea?.color_hex || '#FF0000',
    tipo_recorrido: linea?.tipo_recorrido || 'LINEAL' as TipoRecorrido,
    idParqueo: linea?.idParqueo?.toString() || '',
    estadoLinea: linea?.estadoLinea || 'ABIERTA' as EstadoInfraestructura,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.numero.trim()) newErrors.numero = 'El número de línea es requerido';
    if (!formData.nombreLinea.trim()) newErrors.nombreLinea = 'El nombre es requerido';
    
    // Validate hex color
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexPattern.test(formData.color_hex)) {
      newErrors.color_hex = 'Color debe ser formato hex válido (ej: #FF0000)';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
       await onSubmit({
         numero: formData.numero,
         nombreLinea: formData.nombreLinea,
         color_hex: formData.color_hex,
         tipo_recorrido: formData.tipo_recorrido,
         idParqueo: formData.idParqueo ? parseInt(formData.idParqueo) : null,
         estadoLinea: formData.estadoLinea,
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
        <label className="block text-sm font-medium text-slate-700 mb-1">Número de Línea *</label>
        <input type="text" value={formData.numero} onChange={(e) => setFormData({ ...formData, numero: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" placeholder="ej: L1, T2" />
        {errors.numero && <p className="text-red-600 text-xs mt-1">{errors.numero}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
        <input type="text" value={formData.nombreLinea} onChange={(e) => setFormData({ ...formData, nombreLinea: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" placeholder="ej: Línea Norte-Sur" />
        {errors.nombreLinea && <p className="text-red-600 text-xs mt-1">{errors.nombreLinea}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Color *</label>
        <div className="flex gap-2">
          <input 
            type="color" 
            value={formData.color_hex} 
            onChange={(e) => setFormData({ ...formData, color_hex: e.target.value })} 
            className="h-10 w-20 border border-slate-200 rounded-lg cursor-pointer"
          />
          <input 
            type="text" 
            value={formData.color_hex} 
            onChange={(e) => setFormData({ ...formData, color_hex: e.target.value })} 
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            placeholder="#FF0000"
          />
        </div>
        {errors.color_hex && <p className="text-red-600 text-xs mt-1">{errors.color_hex}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Recorrido *</label>
        <select value={formData.tipo_recorrido} onChange={(e) => setFormData({ ...formData, tipo_recorrido: e.target.value as TipoRecorrido })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="LINEAL">LINEAL</option>
          <option value="CIRCULAR">CIRCULAR</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Parqueo</label>
        <select value={formData.idParqueo} onChange={(e) => setFormData({ ...formData, idParqueo: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Ninguno</option>
          {parqueos.map((p) => <option key={p.id} value={p.id}>{p.nombreParqueo}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
        <select value={formData.estadoLinea} onChange={(e) => setFormData({ ...formData, estadoLinea: e.target.value as EstadoInfraestructura })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="ABIERTA">ABIERTA</option>
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
