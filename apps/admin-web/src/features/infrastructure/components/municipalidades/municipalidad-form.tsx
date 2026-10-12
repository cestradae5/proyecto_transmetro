import { useId, useState } from 'react';
import {
  EstadoMunicipalidad,
  type CreateMunicipalidadDto,
  type Municipalidad,
} from '../../types/infrastructure.types';

interface MunicipalidadFormProps {
  municipalidad?: Municipalidad;
  onSubmit: (data: CreateMunicipalidadDto) => Promise<void>;
  onCancel: () => void;
}

// Matches the API DTO limits (nombre 120, departamento 60).
const NOMBRE_MAX = 120;
const DEPARTAMENTO_MAX = 60;

const INPUT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

export function MunicipalidadForm({ municipalidad, onSubmit, onCancel }: MunicipalidadFormProps) {
  const uid = useId();
  const [formData, setFormData] = useState({
    nombreMunicipalidad: municipalidad?.nombreMunicipalidad ?? '',
    departamento: municipalidad?.departamento ?? '',
    estadoMunicipalidad: municipalidad?.estadoMunicipalidad ?? EstadoMunicipalidad.ACTIVA,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const nombre = formData.nombreMunicipalidad.trim();
    const departamento = formData.departamento.trim();
    if (!nombre) newErrors.nombreMunicipalidad = 'El nombre es requerido';
    else if (nombre.length > NOMBRE_MAX)
      newErrors.nombreMunicipalidad = `El nombre no puede exceder ${NOMBRE_MAX} caracteres`;
    if (!departamento) newErrors.departamento = 'El departamento es requerido';
    else if (departamento.length > DEPARTAMENTO_MAX)
      newErrors.departamento = `El departamento no puede exceder ${DEPARTAMENTO_MAX} caracteres`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        nombreMunicipalidad: formData.nombreMunicipalidad.trim(),
        departamento: formData.departamento.trim(),
        estadoMunicipalidad: formData.estadoMunicipalidad,
      });
    } catch (error: unknown) {
      setErrors({ submit: error instanceof Error && error.message ? error.message : 'Error al guardar' });
    } finally {
      setSubmitting(false);
    }
  };

  const nombreId = `${uid}-nombre`;
  const departamentoId = `${uid}-departamento`;
  const estadoId = `${uid}-estado`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={nombreId} className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
        <input
          id={nombreId}
          type="text"
          value={formData.nombreMunicipalidad}
          onChange={(e) => setFormData({ ...formData, nombreMunicipalidad: e.target.value })}
          className={INPUT_CLASS}
        />
        {errors.nombreMunicipalidad && <p className="text-red-600 text-xs mt-1">{errors.nombreMunicipalidad}</p>}
      </div>

      <div>
        <label htmlFor={departamentoId} className="block text-sm font-medium text-slate-700 mb-1">Departamento *</label>
        <input
          id={departamentoId}
          type="text"
          value={formData.departamento}
          onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
          className={INPUT_CLASS}
        />
        {errors.departamento && <p className="text-red-600 text-xs mt-1">{errors.departamento}</p>}
      </div>

      <div>
        <label htmlFor={estadoId} className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
        <select
          id={estadoId}
          value={formData.estadoMunicipalidad}
          onChange={(e) => setFormData({ ...formData, estadoMunicipalidad: e.target.value as EstadoMunicipalidad })}
          className={INPUT_CLASS}
        >
          {Object.values(EstadoMunicipalidad).map((estado) => (
            <option key={estado} value={estado}>{estado}</option>
          ))}
        </select>
      </div>

      {errors.submit && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{errors.submit}</div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancelar</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">{submitting ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </form>
  );
}
