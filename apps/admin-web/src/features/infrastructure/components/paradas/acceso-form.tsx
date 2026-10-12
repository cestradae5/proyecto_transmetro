import { useId, useState } from 'react';
import {
  EstadoAcceso,
  TipoAcceso,
  type Acceso,
  type CreateAccesoDto,
} from '../../types/infrastructure.types';

export interface AccesoCoordinates {
  latitud: number | string;
  longitud: number | string;
}

interface AccesoFormProps {
  acceso?: Acceso;
  /** Coordinates prefilled on create (the owning parada's). */
  defaultCoordinates?: AccesoCoordinates;
  onSubmit: (data: CreateAccesoDto) => Promise<void>;
  onCancel: () => void;
}

// Matches the API DTO limit for nombreAcceso.
const NOMBRE_MAX = 120;

const INPUT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

// DECIMAL columns may arrive as strings; null/undefined become an empty field.
const toField = (value: number | string | null | undefined) => (value == null ? '' : String(value));

export function AccesoForm({ acceso, defaultCoordinates, onSubmit, onCancel }: AccesoFormProps) {
  const uid = useId();
  const coords = acceso ?? defaultCoordinates;
  const [formData, setFormData] = useState({
    nombreAcceso: acceso?.nombreAcceso ?? '',
    tipoAcceso: acceso?.tipoAcceso ?? TipoAcceso.PEATONAL,
    estadoAcceso: acceso?.estadoAcceso ?? EstadoAcceso.HABILITADO,
    latitud: toField(coords?.latitud),
    longitud: toField(coords?.longitud),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const nombre = formData.nombreAcceso.trim();
    if (!nombre) newErrors.nombreAcceso = 'El nombre es requerido';
    else if (nombre.length > NOMBRE_MAX) newErrors.nombreAcceso = `El nombre no puede exceder ${NOMBRE_MAX} caracteres`;

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
        nombreAcceso: formData.nombreAcceso.trim(),
        tipoAcceso: formData.tipoAcceso,
        estadoAcceso: formData.estadoAcceso,
        latitud: parseFloat(formData.latitud),
        longitud: parseFloat(formData.longitud),
      });
    } catch (error: unknown) {
      setErrors({ submit: error instanceof Error && error.message ? error.message : 'Error al guardar' });
    } finally {
      setSubmitting(false);
    }
  };

  const ids = {
    nombre: `${uid}-nombre`,
    tipo: `${uid}-tipo`,
    estado: `${uid}-estado`,
    latitud: `${uid}-latitud`,
    longitud: `${uid}-longitud`,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={ids.nombre} className="block text-sm font-medium text-slate-700 mb-1">Nombre del acceso *</label>
        <input
          id={ids.nombre}
          type="text"
          value={formData.nombreAcceso}
          onChange={(e) => setFormData({ ...formData, nombreAcceso: e.target.value })}
          className={INPUT_CLASS}
        />
        {errors.nombreAcceso && <p className="text-red-600 text-xs mt-1">{errors.nombreAcceso}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={ids.tipo} className="block text-sm font-medium text-slate-700 mb-1">Tipo *</label>
          <select
            id={ids.tipo}
            value={formData.tipoAcceso}
            onChange={(e) => setFormData({ ...formData, tipoAcceso: e.target.value as TipoAcceso })}
            className={INPUT_CLASS}
          >
            {Object.values(TipoAcceso).map((tipo) => (
              <option key={tipo} value={tipo}>{tipo}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.estado} className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
          <select
            id={ids.estado}
            value={formData.estadoAcceso}
            onChange={(e) => setFormData({ ...formData, estadoAcceso: e.target.value as EstadoAcceso })}
            className={INPUT_CLASS}
          >
            {Object.values(EstadoAcceso).map((estado) => (
              <option key={estado} value={estado}>{estado}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={ids.latitud} className="block text-sm font-medium text-slate-700 mb-1">Latitud *</label>
          <input
            id={ids.latitud}
            type="number"
            step="any"
            value={formData.latitud}
            onChange={(e) => setFormData({ ...formData, latitud: e.target.value })}
            className={INPUT_CLASS}
          />
          {errors.latitud && <p className="text-red-600 text-xs mt-1">{errors.latitud}</p>}
        </div>
        <div>
          <label htmlFor={ids.longitud} className="block text-sm font-medium text-slate-700 mb-1">Longitud *</label>
          <input
            id={ids.longitud}
            type="number"
            step="any"
            value={formData.longitud}
            onChange={(e) => setFormData({ ...formData, longitud: e.target.value })}
            className={INPUT_CLASS}
          />
          {errors.longitud && <p className="text-red-600 text-xs mt-1">{errors.longitud}</p>}
        </div>
      </div>

      {errors.submit && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{errors.submit}</div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancelar</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">{submitting ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </form>
  );
}
