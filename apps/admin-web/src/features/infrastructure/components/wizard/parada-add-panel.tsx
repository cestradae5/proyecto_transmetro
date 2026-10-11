import { useId, useRef, useState } from 'react';
import {
  EstadoInfraestructura,
  type CreateLineaParadaDto,
  type Parada,
  type ParadaFormValues,
} from '../../types/infrastructure.types';
import { saveParadaWithEstacion, type ParadaEstacionGateway } from '../../hooks/save-parada-estacion';
import {
  ErrorAlert,
  FIELD_ERROR_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  ModeToggle,
  PRIMARY_BUTTON_CLASS,
  errorMessage,
  type ChoiceMode,
} from './wizard-ui';

interface ParadaAddPanelProps {
  /** Paradas that are not yet part of the línea. */
  availableParadas: Parada[];
  /** Orden for the new row (current max + 1). */
  nextOrden: number;
  addToLinea: (data: CreateLineaParadaDto) => Promise<unknown>;
  paradaGateway: ParadaEstacionGateway;
}

/** Progress of a "Crear nueva" submit, kept so a retry never creates the parada twice. */
interface PendingParada {
  idParada: string;
  estacionSaved: boolean;
}

const EMPTY_NEW = { nombre: '', latitud: '', longitud: '', esEstacion: false, nombreEstacion: '' };

export function ParadaAddPanel({ availableParadas, nextOrden, addToLinea, paradaGateway }: ParadaAddPanelProps) {
  const uid = useId();
  const [mode, setMode] = useState<ChoiceMode>('existing');
  const [selectedId, setSelectedId] = useState('');
  const [nueva, setNueva] = useState(EMPTY_NEW);
  const [minutos, setMinutos] = useState('0');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const pendingRef = useRef<PendingParada | null>(null);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (mode === 'existing') {
      if (!selectedId) newErrors.select = 'Seleccione una parada';
    } else {
      if (!nueva.nombre.trim()) newErrors.nombre = 'El nombre es requerido';
      const lat = parseFloat(nueva.latitud);
      if (isNaN(lat) || lat < -90 || lat > 90) newErrors.latitud = 'Latitud debe estar entre -90 y 90';
      const lon = parseFloat(nueva.longitud);
      if (isNaN(lon) || lon < -180 || lon > 180) newErrors.longitud = 'Longitud debe estar entre -180 y 180';
      if (nueva.esEstacion && !nueva.nombreEstacion.trim())
        newErrors.nombreEstacion = 'El nombre de la estación es requerido';
    }
    const min = Number(minutos);
    if (minutos.trim() === '' || !Number.isInteger(min) || min < 0)
      newErrors.minutos = 'Los minutos deben ser un número entero >= 0';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /** Creates (or, on retry, updates) the parada and its estación; returns the parada id. */
  const saveNewParada = async (): Promise<string> => {
    const latitud = parseFloat(nueva.latitud);
    const longitud = parseFloat(nueva.longitud);
    const values: ParadaFormValues = {
      parada: { nombreParada: nueva.nombre.trim(), latitud, longitud, estadoParada: EstadoInfraestructura.ACTIVA },
      estacion: nueva.esEstacion
        ? { nombreEstacion: nueva.nombreEstacion.trim(), latitud, longitud, estadoEstacion: EstadoInfraestructura.ACTIVA }
        : null,
      idEstacion: null,
    };
    const pending = pendingRef.current;
    if (pending?.estacionSaved) return pending.idParada;

    await saveParadaWithEstacion(pending ? pending.idParada : null, values, {
      ...paradaGateway,
      createParada: async (data) => {
        const created = await paradaGateway.createParada(data);
        pendingRef.current = { idParada: String(created.idParada), estacionSaved: false };
        return created;
      },
    });
    const saved = pendingRef.current as PendingParada | null;
    if (!saved) throw new Error('No se pudo crear la parada');
    pendingRef.current = { ...saved, estacionSaved: true };
    return saved.idParada;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const idParada = mode === 'existing' ? selectedId : await saveNewParada();
      await addToLinea({ idParada, orden: nextOrden, minutosHastaSiguiente: Number(minutos) });
      pendingRef.current = null;
      setSelectedId('');
      setNueva(EMPTY_NEW);
      setMinutos('0');
    } catch (error: unknown) {
      setErrors({ submit: errorMessage(error, 'Error al agregar la parada') });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (name: string) => `${uid}-${name}`;

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
      <h4 className="text-sm font-semibold text-slate-800">Agregar parada</h4>
      <p className="mt-0.5 mb-3 text-xs text-slate-500">{`Se agregará al final del recorrido (posición ${nextOrden}).`}</p>

      <ModeToggle
        legend="Origen de la parada"
        value={mode}
        existingLabel="Elegir existente"
        newLabel="Crear nueva"
        disabled={submitting}
        onChange={(next) => {
          setMode(next);
          setErrors({});
        }}
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {mode === 'existing' ? (
          <div>
            <label htmlFor={field('select')} className={LABEL_CLASS}>Parada existente</label>
            <select id={field('select')} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={INPUT_CLASS}>
              <option value="">Seleccione una parada</option>
              {availableParadas.map((p) => (
                <option key={p.idParada} value={String(p.idParada)}>
                  {p.esEstacion ? `${p.nombreParada} (Estación)` : p.nombreParada}
                </option>
              ))}
            </select>
            {errors.select && <p className={FIELD_ERROR_CLASS}>{errors.select}</p>}
            {availableParadas.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">No hay otras paradas disponibles. Use "Crear nueva".</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={field('nombre')} className={LABEL_CLASS}>Nombre de la parada *</label>
              <input id={field('nombre')} type="text" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} className={INPUT_CLASS} />
              {errors.nombre && <p className={FIELD_ERROR_CLASS}>{errors.nombre}</p>}
            </div>
            <div>
              <label htmlFor={field('lat')} className={LABEL_CLASS}>Latitud *</label>
              <input id={field('lat')} type="number" step="0.000001" value={nueva.latitud} onChange={(e) => setNueva({ ...nueva, latitud: e.target.value })} className={INPUT_CLASS} />
              {errors.latitud && <p className={FIELD_ERROR_CLASS}>{errors.latitud}</p>}
            </div>
            <div>
              <label htmlFor={field('lon')} className={LABEL_CLASS}>Longitud *</label>
              <input id={field('lon')} type="number" step="0.000001" value={nueva.longitud} onChange={(e) => setNueva({ ...nueva, longitud: e.target.value })} className={INPUT_CLASS} />
              {errors.longitud && <p className={FIELD_ERROR_CLASS}>{errors.longitud}</p>}
            </div>
            <div className="sm:col-span-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={nueva.esEstacion}
                  onChange={(e) => setNueva({ ...nueva, esEstacion: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Es estación
              </label>
              <p className="text-xs text-slate-500">Las estaciones usan las mismas coordenadas de la parada.</p>
            </div>
            {nueva.esEstacion && (
              <div className="sm:col-span-3">
                <label htmlFor={field('estacion')} className={LABEL_CLASS}>Nombre de la estación *</label>
                <input id={field('estacion')} type="text" value={nueva.nombreEstacion} onChange={(e) => setNueva({ ...nueva, nombreEstacion: e.target.value })} className={INPUT_CLASS} />
                {errors.nombreEstacion && <p className={FIELD_ERROR_CLASS}>{errors.nombreEstacion}</p>}
              </div>
            )}
          </div>
        )}

        <div className="max-w-xs">
          <label htmlFor={field('minutos')} className={LABEL_CLASS}>Minutos hasta la siguiente *</label>
          <input id={field('minutos')} type="number" min="0" step="1" value={minutos} onChange={(e) => setMinutos(e.target.value)} className={INPUT_CLASS} />
          {errors.minutos && <p className={FIELD_ERROR_CLASS}>{errors.minutos}</p>}
        </div>

        <ErrorAlert message={errors.submit ?? null} />

        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className={PRIMARY_BUTTON_CLASS}>
            {submitting ? 'Agregando...' : 'Agregar parada'}
          </button>
        </div>
      </form>
    </div>
  );
}
