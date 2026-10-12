import { useState } from 'react';
import type {
  Estacion,
  EstadoInfraestructura,
  Parada,
  ParadaFormValues,
} from '../../types/infrastructure.types';
import { ESTACION_IN_USE_MESSAGE, isEstacionInUseError } from '../../hooks/save-parada-estacion';

interface ParadaFormProps {
  parada?: Parada;
  /** Estación currently extending `parada` (looked up by `parada.idEstacion`). */
  estacion?: Estacion;
  onSubmit: (values: ParadaFormValues) => Promise<void>;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

/** Empty input -> null; otherwise the parsed number (NaN when invalid). */
function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : parseFloat(value);
}

export function ParadaForm({ parada, estacion, onSubmit, onCancel }: ParadaFormProps) {
  const existingIdEstacion = parada?.idEstacion ?? null;
  const [formData, setFormData] = useState({
    nombreParada: parada?.nombreParada || '',
    latitud: parada?.latitud?.toString() || '',
    longitud: parada?.longitud?.toString() || '',
    estadoParada: parada?.estadoParada || 'ACTIVA' as EstadoInfraestructura,
  });
  const [esEstacion, setEsEstacion] = useState(Boolean(parada?.esEstacion));
  const [estacionData, setEstacionData] = useState({
    nombreEstacion: estacion?.nombreEstacion || '',
    latitud: estacion?.latitud?.toString() || '',
    longitud: estacion?.longitud?.toString() || '',
    estadoEstacion: estacion?.estadoEstacion || 'ACTIVA' as EstadoInfraestructura,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleToggleEstacion = (checked: boolean) => {
    // Turning off an existing estación hard-deletes it on save: ask first.
    if (
      !checked &&
      existingIdEstacion !== null &&
      !confirm('¿Quitar la estación de esta parada? La estación se eliminará al guardar.')
    ) {
      return;
    }
    setEsEstacion(checked);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.nombreParada.trim()) {
      newErrors.nombreParada = 'El nombre es requerido';
    }

    const lat = parseFloat(formData.latitud);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      newErrors.latitud = 'Latitud debe estar entre -90 y 90';
    }

    const lon = parseFloat(formData.longitud);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      newErrors.longitud = 'Longitud debe estar entre -180 y 180';
    }

    if (esEstacion) {
      if (!estacionData.nombreEstacion.trim()) {
        newErrors.nombreEstacion = 'El nombre de la estación es requerido';
      }
      // Blank estación coordinates fall back to the parada's.
      const estLat = optionalNumber(estacionData.latitud);
      if (estLat !== null && (isNaN(estLat) || estLat < -90 || estLat > 90)) {
        newErrors.estacionLatitud = 'Latitud debe estar entre -90 y 90';
      }
      const estLon = optionalNumber(estacionData.longitud);
      if (estLon !== null && (isNaN(estLon) || estLon < -180 || estLon > 180)) {
        newErrors.estacionLongitud = 'Longitud debe estar entre -180 y 180';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const latitud = parseFloat(formData.latitud);
    const longitud = parseFloat(formData.longitud);

    setSubmitting(true);
    try {
      await onSubmit({
        parada: {
          nombreParada: formData.nombreParada,
          latitud,
          longitud,
          estadoParada: formData.estadoParada,
        },
        estacion: esEstacion
          ? {
              nombreEstacion: estacionData.nombreEstacion,
              latitud: optionalNumber(estacionData.latitud) ?? latitud,
              longitud: optionalNumber(estacionData.longitud) ?? longitud,
              estadoEstacion: estacionData.estadoEstacion,
            }
          : null,
        idEstacion: existingIdEstacion,
      });
    } catch (error: any) {
      if (isEstacionInUseError(error)) {
        // The estación was not deleted: keep the toggle on.
        setEsEstacion(true);
        setErrors({ submit: ESTACION_IN_USE_MESSAGE });
      } else {
        setErrors({ submit: error.message || 'Error al guardar' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
        <input
          type="text"
          value={formData.nombreParada}
          onChange={(e) => setFormData({ ...formData, nombreParada: e.target.value })}
          className={INPUT_CLASS}
        />
        {errors.nombreParada && <p className="text-red-600 text-xs mt-1">{errors.nombreParada}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Latitud *</label>
          <input
            type="number"
            step="0.000001"
            value={formData.latitud}
            onChange={(e) => setFormData({ ...formData, latitud: e.target.value })}
            className={INPUT_CLASS}
          />
          {errors.latitud && <p className="text-red-600 text-xs mt-1">{errors.latitud}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Longitud *</label>
          <input
            type="number"
            step="0.000001"
            value={formData.longitud}
            onChange={(e) => setFormData({ ...formData, longitud: e.target.value })}
            className={INPUT_CLASS}
          />
          {errors.longitud && <p className="text-red-600 text-xs mt-1">{errors.longitud}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
        <select
          value={formData.estadoParada}
          onChange={(e) => setFormData({ ...formData, estadoParada: e.target.value as EstadoInfraestructura })}
          className={INPUT_CLASS}
        >
          <option value="ACTIVA">ACTIVA</option>
          <option value="CERRADA">CERRADA</option>
          <option value="MANTENIMIENTO">MANTENIMIENTO</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={esEstacion}
          disabled={submitting}
          onChange={(e) => handleToggleEstacion(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Es estación
      </label>

      {esEstacion && (
        <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">Estación</legend>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la estación *</label>
            <input
              type="text"
              aria-label="Nombre de la estación"
              value={estacionData.nombreEstacion}
              onChange={(e) => setEstacionData({ ...estacionData, nombreEstacion: e.target.value })}
              className={INPUT_CLASS}
            />
            {errors.nombreEstacion && <p className="text-red-600 text-xs mt-1">{errors.nombreEstacion}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Latitud de la estación</label>
              <input
                type="number"
                step="0.000001"
                aria-label="Latitud de la estación"
                placeholder="Igual que la parada"
                value={estacionData.latitud}
                onChange={(e) => setEstacionData({ ...estacionData, latitud: e.target.value })}
                className={INPUT_CLASS}
              />
              {errors.estacionLatitud && <p className="text-red-600 text-xs mt-1">{errors.estacionLatitud}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Longitud de la estación</label>
              <input
                type="number"
                step="0.000001"
                aria-label="Longitud de la estación"
                placeholder="Igual que la parada"
                value={estacionData.longitud}
                onChange={(e) => setEstacionData({ ...estacionData, longitud: e.target.value })}
                className={INPUT_CLASS}
              />
              {errors.estacionLongitud && <p className="text-red-600 text-xs mt-1">{errors.estacionLongitud}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Estado de la estación *</label>
            <select
              aria-label="Estado de la estación"
              value={estacionData.estadoEstacion}
              onChange={(e) =>
                setEstacionData({ ...estacionData, estadoEstacion: e.target.value as EstadoInfraestructura })
              }
              className={INPUT_CLASS}
            >
              <option value="ACTIVA">ACTIVA</option>
              <option value="CERRADA">CERRADA</option>
              <option value="MANTENIMIENTO">MANTENIMIENTO</option>
            </select>
          </div>
        </fieldset>
      )}

      {errors.submit && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {errors.submit}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
