import { useState } from 'react';
import type { Linea, TipoRecorrido, EstadoLinea, Parqueo } from '../../types/infrastructure.types';

interface LineaFormProps {
  linea?: Linea;
  parqueos: Parqueo[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function LineaForm({ linea, parqueos, onSubmit, onCancel }: LineaFormProps) {
  const [formData, setFormData] = useState({
    numeroLinea: linea?.numeroLinea || '',
    nombreLinea: linea?.nombreLinea || '',
    colorHex: linea?.colorHex || '#FF0000',
    tipoRecorrido: linea?.tipoRecorrido || 'LINEAL' as TipoRecorrido,
    idParqueo: linea?.idParqueo?.toString() || '',
    estadoLinea: linea?.estadoLinea || 'ACTIVA' as EstadoLinea,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.numeroLinea.trim()) newErrors.numeroLinea = 'El número de línea es requerido';
    if (!formData.nombreLinea.trim()) newErrors.nombreLinea = 'El nombre es requerido';
    
    // Validate hex color (backend requires exact #RRGGBB, 6 hex digits)
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    if (!hexPattern.test(formData.colorHex)) {
      newErrors.colorHex = 'Color debe ser formato hex válido de 6 dígitos (ej: #FF0000)';
    }

    if (!formData.idParqueo) newErrors.idParqueo = 'El parqueo es requerido';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
       await onSubmit({
         numeroLinea: formData.numeroLinea,
         nombreLinea: formData.nombreLinea,
         colorHex: formData.colorHex,
         tipoRecorrido: formData.tipoRecorrido,
         idParqueo: formData.idParqueo,
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
        <input type="text" value={formData.numeroLinea} onChange={(e) => setFormData({ ...formData, numeroLinea: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" placeholder="ej: L1, T2" />
        {errors.numeroLinea && <p className="text-red-600 text-xs mt-1">{errors.numeroLinea}</p>}
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
            value={formData.colorHex} 
            onChange={(e) => setFormData({ ...formData, colorHex: e.target.value })} 
            className="h-10 w-20 border border-slate-200 rounded-lg cursor-pointer"
          />
          <input 
            type="text" 
            value={formData.colorHex} 
            onChange={(e) => setFormData({ ...formData, colorHex: e.target.value })} 
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
            placeholder="#FF0000"
          />
        </div>
        {errors.colorHex && <p className="text-red-600 text-xs mt-1">{errors.colorHex}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Recorrido *</label>
        <select value={formData.tipoRecorrido} onChange={(e) => setFormData({ ...formData, tipoRecorrido: e.target.value as TipoRecorrido })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="LINEAL">LINEAL</option>
          <option value="CIRCULAR">CIRCULAR</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Parqueo *</label>
        <select value={formData.idParqueo} onChange={(e) => setFormData({ ...formData, idParqueo: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">Seleccionar parqueo</option>
          {parqueos.map((p) => <option key={p.idParqueo} value={p.idParqueo}>{p.nombreParqueo}</option>)}
        </select>
        {errors.idParqueo && <p className="text-red-600 text-xs mt-1">{errors.idParqueo}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
        <select value={formData.estadoLinea} onChange={(e) => setFormData({ ...formData, estadoLinea: e.target.value as EstadoLinea })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="ACTIVA">ACTIVA</option>
          <option value="INACTIVA">INACTIVA</option>
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
