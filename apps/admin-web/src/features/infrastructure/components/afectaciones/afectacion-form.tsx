import { useState } from 'react';
import type { Afectacion, TipoAfectacion, EstadoAfectacion, Parada, Estacion } from '../../types/infrastructure.types';

interface AfectacionFormProps {
  afectacion?: Afectacion;
  paradas: Parada[];
  estaciones: Estacion[];
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function AfectacionForm({ afectacion, paradas, estaciones, onSubmit, onCancel }: AfectacionFormProps) {
  // Determine initial target type
    const initialTargetType = afectacion?.idParada ? 'parada' : afectacion?.idEstacion ? 'estacion' : 'parada';
    
    const [formData, setFormData] = useState({
      tipoAfectacion: afectacion?.tipoAfectacion || 'TEMPORAL' as TipoAfectacion,
      motivo: afectacion?.motivo || '',
      fechaInicio: afectacion?.fechaInicio?.split('T')[0] || '',
      fechaFin: afectacion?.fechaFin?.split('T')[0] || '',
      targetType: initialTargetType,
      idParada: afectacion?.idParada?.toString() || '',
      idEstacion: afectacion?.idEstacion?.toString() || '',
      estadoAfectacion: afectacion?.estadoAfectacion || 'ACTIVA' as EstadoAfectacion,
    });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.motivo.trim()) newErrors.motivo = 'El motivo es requerido';
    if (!formData.fechaInicio) newErrors.fechaInicio = 'La fecha de inicio es requerida';
    
    // Validate date range
    if (formData.fechaFin && formData.fechaInicio) {
      const inicio = new Date(formData.fechaInicio);
      const fin = new Date(formData.fechaFin);
      if (fin < inicio) {
        newErrors.fechaFin = 'La fecha de fin debe ser posterior a la fecha de inicio';
      }
    }
    
    // XOR validation: exactly one of id_parada or id_estacion must be set
    const hasParada = formData.targetType === 'parada' && formData.idParada;
    const hasEstacion = formData.targetType === 'estacion' && formData.idEstacion;
    
    if (!hasParada && !hasEstacion) {
      newErrors.target = 'Debe seleccionar una parada o una estación';
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
        tipoAfectacion: formData.tipoAfectacion,
        motivo: formData.motivo,
        fechaInicio: formData.fechaInicio,
        fechaFin: formData.fechaFin || undefined,
        idParada: formData.targetType === 'parada' && formData.idParada ? formData.idParada : undefined,
        idEstacion: formData.targetType === 'estacion' && formData.idEstacion ? formData.idEstacion : undefined,
        estadoAfectacion: formData.estadoAfectacion,
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
        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Afectación *</label>
        <select value={formData.tipoAfectacion} onChange={(e) => setFormData({ ...formData, tipoAfectacion: e.target.value as TipoAfectacion })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="TEMPORAL">TEMPORAL</option>
          <option value="PERMANENTE">PERMANENTE</option>
          <option value="MANTENIMIENTO">MANTENIMIENTO</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Motivo *</label>
        <textarea 
          value={formData.motivo} 
          onChange={(e) => setFormData({ ...formData, motivo: e.target.value })} 
          rows={3}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          placeholder="Describa el motivo de la afectación..."
        />
        {errors.motivo && <p className="text-red-600 text-xs mt-1">{errors.motivo}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Inicio *</label>
          <input 
            type="date" 
            value={formData.fechaInicio} 
            onChange={(e) => setFormData({ ...formData, fechaInicio: e.target.value })} 
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.fechaInicio && <p className="text-red-600 text-xs mt-1">{errors.fechaInicio}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Fin</label>
          <input 
            type="date" 
            value={formData.fechaFin} 
            onChange={(e) => setFormData({ ...formData, fechaFin: e.target.value })} 
            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {errors.fechaFin && <p className="text-red-600 text-xs mt-1">{errors.fechaFin}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Afecta a *</label>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input 
              type="radio" 
              id="target-parada" 
              name="targetType" 
              value="parada"
              checked={formData.targetType === 'parada'}
              onChange={(e) => setFormData({ ...formData, targetType: e.target.value, idEstacion: '' })}
              className="w-4 h-4 text-primary focus:ring-2 focus:ring-primary"
            />
            <label htmlFor="target-parada" className="flex-1">
              <select 
value={formData.idParada} 
                 onChange={(e) => setFormData({ ...formData, idParada: e.target.value, targetType: 'parada' })}
                disabled={formData.targetType !== 'parada'}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Seleccionar parada</option>
{paradas.map((p) => <option key={p.idParada} value={p.idParada}>{p.nombreParada}</option>)}
               </select>
             </label>
           </div>

           <div className="flex items-center gap-2">
             <input 
               type="radio" 
               id="target-estacion" 
               name="targetType" 
               value="estacion"
               checked={formData.targetType === 'estacion'}
               onChange={(e) => setFormData({ ...formData, targetType: e.target.value, idParada: '' })}
               className="w-4 h-4 text-primary focus:ring-2 focus:ring-primary"
             />
             <label htmlFor="target-estacion" className="flex-1">
               <select 
                 value={formData.idEstacion} 
                 onChange={(e) => setFormData({ ...formData, idEstacion: e.target.value, targetType: 'estacion' })}
                disabled={formData.targetType !== 'estacion'}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Seleccionar estación</option>
{estaciones.map((e) => <option key={e.idEstacion} value={e.idEstacion}>{e.nombreEstacion}</option>)}
               </select>
            </label>
          </div>
        </div>
        {errors.target && <p className="text-red-600 text-xs mt-1">{errors.target}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
<select value={formData.estadoAfectacion} onChange={(e) => setFormData({ ...formData, estadoAfectacion: e.target.value as EstadoAfectacion })} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
           <option value="ACTIVA">ACTIVA</option>
           <option value="CERRADA">CERRADA</option>
           <option value="PENDIENTE">PENDIENTE</option>
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
