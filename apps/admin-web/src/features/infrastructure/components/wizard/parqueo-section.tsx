import { useId, useRef, useState } from 'react';
import {
  EstadoParqueo,
  TipoParqueo,
  type CreateParqueoDto,
  type Linea,
  type Parqueo,
} from '../../types/infrastructure.types';
import {
  CARD_CLASS,
  DANGER_BUTTON_CLASS,
  ErrorAlert,
  FIELD_ERROR_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  ModeToggle,
  PRIMARY_BUTTON_CLASS,
  errorMessage,
  type ChoiceMode,
} from './wizard-ui';

interface ParqueoSectionProps {
  linea: Linea;
  parqueos: Parqueo[];
  createParqueo: (data: CreateParqueoDto) => Promise<Parqueo>;
  /** PATCHes the línea's idParqueo (`null` clears it). */
  assignParqueo: (idParqueo: string | null) => Promise<void>;
}

const EMPTY_PARQUEO = {
  nombreParqueo: '',
  tipoParqueo: TipoParqueo.CENTRAL,
  direccion: '',
  latitud: '',
  longitud: '',
  capacidadUnidades: '',
  estadoParqueo: EstadoParqueo.ACTIVO,
};

export function ParqueoSection({ linea, parqueos, createParqueo, assignParqueo }: ParqueoSectionProps) {
  const uid = useId();
  const [mode, setMode] = useState<ChoiceMode>('existing');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(EMPTY_PARQUEO);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'assign' | 'clear' | null>(null);
  // A parqueo created here whose assignment failed: a retry reuses it.
  const createdRef = useRef<Parqueo | null>(null);

  const assignedId = linea.idParqueo == null ? null : String(linea.idParqueo);
  const assigned = assignedId ? parqueos.find((p) => String(p.idParqueo) === assignedId) : undefined;

  const validateNew = () => {
    const newErrors: Record<string, string> = {};
    if (!form.nombreParqueo.trim()) newErrors.nombreParqueo = 'El nombre es requerido';
    if (!form.direccion.trim()) newErrors.direccion = 'La dirección es requerida';
    const lat = parseFloat(form.latitud);
    if (isNaN(lat) || lat < -90 || lat > 90) newErrors.latitud = 'Latitud debe estar entre -90 y 90';
    const lon = parseFloat(form.longitud);
    if (isNaN(lon) || lon < -180 || lon > 180) newErrors.longitud = 'Longitud debe estar entre -180 y 180';
    const cap = Number(form.capacidadUnidades);
    if (form.capacidadUnidades.trim() === '' || !Number.isInteger(cap) || cap < 0)
      newErrors.capacidadUnidades = 'La capacidad debe ser un número entero >= 0';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'existing') {
      if (!selectedId) {
        setErrors({ select: 'Seleccione un parqueo' });
        return;
      }
      setErrors({});
    } else if (!createdRef.current && !validateNew()) {
      return;
    }
    setBusy('assign');
    try {
      let idParqueo = selectedId;
      if (mode === 'new') {
        if (!createdRef.current) {
          createdRef.current = await createParqueo({
            nombreParqueo: form.nombreParqueo.trim(),
            tipoParqueo: form.tipoParqueo,
            direccion: form.direccion.trim(),
            latitud: parseFloat(form.latitud),
            longitud: parseFloat(form.longitud),
            capacidadUnidades: Number(form.capacidadUnidades),
            estadoParqueo: form.estadoParqueo,
          });
        }
        idParqueo = String(createdRef.current.idParqueo);
      }
      await assignParqueo(idParqueo);
      createdRef.current = null;
      setForm(EMPTY_PARQUEO);
      setSelectedId('');
      setMode('existing');
    } catch (error: unknown) {
      setErrors({ submit: errorMessage(error, 'Error al asignar el parqueo') });
    } finally {
      setBusy(null);
    }
  };

  const handleClear = async () => {
    setBusy('clear');
    setErrors({});
    try {
      await assignParqueo(null);
    } catch (error: unknown) {
      setErrors({ submit: errorMessage(error, 'Error al quitar el parqueo') });
    } finally {
      setBusy(null);
    }
  };

  const field = (name: string) => `${uid}-${name}`;
  const titleId = field('title');

  return (
    <section className={CARD_CLASS} aria-labelledby={titleId}>
      <h3 id={titleId} className="text-lg font-semibold text-slate-900">Parqueo (opcional)</h3>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Lugar donde se guardan las unidades de la línea. Puede dejarse vacío y asignarse después.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-700" aria-live="polite">
          {assignedId ? (
            <>Parqueo asignado: <span className="font-semibold">{assigned?.nombreParqueo ?? `#${assignedId}`}</span></>
          ) : (
            'Sin parqueo asignado'
          )}
        </p>
        {assignedId && (
          <button type="button" onClick={handleClear} disabled={busy !== null} className={DANGER_BUTTON_CLASS}>
            {busy === 'clear' ? 'Quitando...' : 'Quitar'}
          </button>
        )}
      </div>

      <ModeToggle
        legend="Origen del parqueo"
        value={mode}
        existingLabel="Elegir existente"
        newLabel="Crear nuevo"
        disabled={busy !== null}
        onChange={(next) => {
          setMode(next);
          setErrors({});
        }}
      />

      <form onSubmit={handleAssign} noValidate className="space-y-4">
        {mode === 'existing' ? (
          <div>
            <label htmlFor={field('select')} className={LABEL_CLASS}>Parqueo</label>
            <select id={field('select')} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={INPUT_CLASS}>
              <option value="">Seleccione un parqueo</option>
              {parqueos.map((p) => (
                <option key={p.idParqueo} value={p.idParqueo}>{p.nombreParqueo}</option>
              ))}
            </select>
            {errors.select && <p className={FIELD_ERROR_CLASS}>{errors.select}</p>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={field('nombre')} className={LABEL_CLASS}>Nombre del parqueo *</label>
              <input id={field('nombre')} type="text" value={form.nombreParqueo} onChange={(e) => setForm({ ...form, nombreParqueo: e.target.value })} className={INPUT_CLASS} />
              {errors.nombreParqueo && <p className={FIELD_ERROR_CLASS}>{errors.nombreParqueo}</p>}
            </div>
            <div>
              <label htmlFor={field('tipo')} className={LABEL_CLASS}>Tipo de parqueo *</label>
              <select id={field('tipo')} value={form.tipoParqueo} onChange={(e) => setForm({ ...form, tipoParqueo: e.target.value as TipoParqueo })} className={INPUT_CLASS}>
                {Object.values(TipoParqueo).map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={field('direccion')} className={LABEL_CLASS}>Dirección *</label>
              <input id={field('direccion')} type="text" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className={INPUT_CLASS} />
              {errors.direccion && <p className={FIELD_ERROR_CLASS}>{errors.direccion}</p>}
            </div>
            <div>
              <label htmlFor={field('lat')} className={LABEL_CLASS}>Latitud del parqueo *</label>
              <input id={field('lat')} type="number" step="0.000001" value={form.latitud} onChange={(e) => setForm({ ...form, latitud: e.target.value })} className={INPUT_CLASS} />
              {errors.latitud && <p className={FIELD_ERROR_CLASS}>{errors.latitud}</p>}
            </div>
            <div>
              <label htmlFor={field('lon')} className={LABEL_CLASS}>Longitud del parqueo *</label>
              <input id={field('lon')} type="number" step="0.000001" value={form.longitud} onChange={(e) => setForm({ ...form, longitud: e.target.value })} className={INPUT_CLASS} />
              {errors.longitud && <p className={FIELD_ERROR_CLASS}>{errors.longitud}</p>}
            </div>
            <div>
              <label htmlFor={field('capacidad')} className={LABEL_CLASS}>Capacidad de unidades *</label>
              <input id={field('capacidad')} type="number" min="0" value={form.capacidadUnidades} onChange={(e) => setForm({ ...form, capacidadUnidades: e.target.value })} className={INPUT_CLASS} />
              {errors.capacidadUnidades && <p className={FIELD_ERROR_CLASS}>{errors.capacidadUnidades}</p>}
            </div>
            <div>
              <label htmlFor={field('estado')} className={LABEL_CLASS}>Estado del parqueo *</label>
              <select id={field('estado')} value={form.estadoParqueo} onChange={(e) => setForm({ ...form, estadoParqueo: e.target.value as EstadoParqueo })} className={INPUT_CLASS}>
                {Object.values(EstadoParqueo).map((estado) => <option key={estado} value={estado}>{estado}</option>)}
              </select>
            </div>
          </div>
        )}

        <ErrorAlert message={errors.submit ?? null} />

        <div className="flex justify-end">
          <button type="submit" disabled={busy !== null} className={PRIMARY_BUTTON_CLASS}>
            {busy === 'assign' ? 'Asignando...' : mode === 'new' ? 'Crear y asignar' : 'Asignar'}
          </button>
        </div>
      </form>
    </section>
  );
}
