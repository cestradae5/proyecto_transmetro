import { useId, useState } from 'react';
import {
  EstadoMunicipalidad,
  type CreateMunicipalidadDto,
  type Municipalidad,
} from '../../types/infrastructure.types';
import {
  CARD_CLASS,
  ErrorAlert,
  FIELD_ERROR_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  ModeToggle,
  PRIMARY_BUTTON_CLASS,
  errorMessage,
  type ChoiceMode,
} from './wizard-ui';

// Matches the API DTO limits.
const NOMBRE_MAX = 120;
const DEPARTAMENTO_MAX = 60;

interface StepMunicipalidadProps {
  municipalidades: Municipalidad[];
  loading: boolean;
  selected: Municipalidad | null;
  /** True once the línea exists: the municipalidad can no longer change. */
  readOnly: boolean;
  onCreate: (data: CreateMunicipalidadDto) => Promise<Municipalidad>;
  onConfirm: (municipalidad: Municipalidad) => void;
}

export function StepMunicipalidad({ municipalidades, loading, selected, readOnly, onCreate, onConfirm }: StepMunicipalidadProps) {
  const uid = useId();
  const [mode, setMode] = useState<ChoiceMode>('existing');
  const [selectedId, setSelectedId] = useState(selected ? String(selected.idMunicipalidad) : '');
  const [nombre, setNombre] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const activas = municipalidades.filter((m) => m.estadoMunicipalidad === EstadoMunicipalidad.ACTIVA);

  if (readOnly && selected) {
    return (
      <section className={CARD_CLASS} aria-labelledby={`${uid}-title`}>
        <h3 id={`${uid}-title`} className="text-lg font-semibold text-slate-900">Municipalidad</h3>
        <p className="mt-2 text-sm text-slate-700">
          <span className="font-medium">{selected.nombreMunicipalidad}</span> ({selected.departamento})
        </p>
        <p className="mt-1 text-xs text-slate-500">
          La línea ya fue creada para esta municipalidad, por eso no se puede cambiar desde el asistente.
        </p>
      </section>
    );
  }

  const validateNew = () => {
    const newErrors: Record<string, string> = {};
    const n = nombre.trim();
    const d = departamento.trim();
    if (!n) newErrors.nombre = 'El nombre es requerido';
    else if (n.length > NOMBRE_MAX) newErrors.nombre = `El nombre no puede exceder ${NOMBRE_MAX} caracteres`;
    if (!d) newErrors.departamento = 'El departamento es requerido';
    else if (d.length > DEPARTAMENTO_MAX)
      newErrors.departamento = `El departamento no puede exceder ${DEPARTAMENTO_MAX} caracteres`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'existing') {
      const found = activas.find((m) => String(m.idMunicipalidad) === selectedId);
      if (!found) {
        setErrors({ select: 'Seleccione una municipalidad' });
        return;
      }
      setErrors({});
      onConfirm(found);
      return;
    }
    if (!validateNew()) return;
    setSubmitting(true);
    try {
      const created = await onCreate({ nombreMunicipalidad: nombre.trim(), departamento: departamento.trim() });
      onConfirm(created);
    } catch (error: unknown) {
      setErrors({ submit: errorMessage(error, 'Error al crear la municipalidad') });
    } finally {
      setSubmitting(false);
    }
  };

  const selectId = `${uid}-select`;
  const nombreId = `${uid}-nombre`;
  const departamentoId = `${uid}-departamento`;

  return (
    <section className={CARD_CLASS} aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="text-lg font-semibold text-slate-900">Municipalidad</h3>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        Elija la municipalidad a la que pertenece la nueva línea o registre una nueva.
      </p>

      <ModeToggle
        legend="Origen de la municipalidad"
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
            <label htmlFor={selectId} className={LABEL_CLASS}>Municipalidad *</label>
            <select id={selectId} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={INPUT_CLASS}>
              <option value="">{loading ? 'Cargando...' : 'Seleccione una municipalidad'}</option>
              {activas.map((m) => (
                <option key={m.idMunicipalidad} value={m.idMunicipalidad}>
                  {`${m.nombreMunicipalidad} (${m.departamento})`}
                </option>
              ))}
            </select>
            {errors.select && <p className={FIELD_ERROR_CLASS}>{errors.select}</p>}
            {!loading && activas.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">No hay municipalidades activas. Use "Crear nueva".</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={nombreId} className={LABEL_CLASS}>Nombre *</label>
              <input id={nombreId} type="text" value={nombre} maxLength={NOMBRE_MAX} onChange={(e) => setNombre(e.target.value)} className={INPUT_CLASS} />
              {errors.nombre && <p className={FIELD_ERROR_CLASS}>{errors.nombre}</p>}
            </div>
            <div>
              <label htmlFor={departamentoId} className={LABEL_CLASS}>Departamento *</label>
              <input id={departamentoId} type="text" value={departamento} maxLength={DEPARTAMENTO_MAX} onChange={(e) => setDepartamento(e.target.value)} className={INPUT_CLASS} />
              {errors.departamento && <p className={FIELD_ERROR_CLASS}>{errors.departamento}</p>}
            </div>
          </div>
        )}

        <ErrorAlert message={errors.submit ?? null} />

        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className={PRIMARY_BUTTON_CLASS}>
            {submitting ? 'Guardando...' : 'Continuar'}
          </button>
        </div>
      </form>
    </section>
  );
}
