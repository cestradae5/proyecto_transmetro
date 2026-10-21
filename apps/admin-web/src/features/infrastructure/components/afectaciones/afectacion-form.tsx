import { useId, useState } from 'react';
import {
  AccionAfectacion,
  type CreateAfectacionDto,
  type Estacion,
  type Linea,
  type Parada,
} from '../../types/infrastructure.types';

type TargetType = 'linea' | 'parada' | 'estacion';

const TARGET_LABELS: Record<TargetType, string> = {
  linea: 'Línea',
  parada: 'Parada',
  estacion: 'Estación',
};

const TARGET_ID_KEYS = {
  linea: 'idLinea',
  parada: 'idParada',
  estacion: 'idEstacion',
} as const;

const FIELD_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

interface AfectacionFormProps {
  lineas: Linea[];
  paradas: Parada[];
  estaciones: Estacion[];
  onSubmit: (data: CreateAfectacionDto) => Promise<void>;
  onCancel: () => void;
}

/** Creates an afectación: activates or deactivates exactly one línea, parada or estación. */
export function AfectacionForm({ lineas, paradas, estaciones, onSubmit, onCancel }: AfectacionFormProps) {
  const uid = useId();
  const [accion, setAccion] = useState<AccionAfectacion>(AccionAfectacion.DESACTIVAR);
  const [targetType, setTargetType] = useState<TargetType>('linea');
  const [targetId, setTargetId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Option text carries the current state so the user sees what the action changes.
  const options: { value: string; label: string }[] =
    targetType === 'linea'
      ? lineas.map((l) => ({ value: String(l.idLinea), label: `${l.numeroLinea} - ${l.nombreLinea} (${l.estadoLinea})` }))
      : targetType === 'parada'
        ? paradas.map((p) => ({ value: String(p.idParada), label: `${p.nombreParada} (${p.estadoParada})` }))
        : estaciones.map((e) => ({ value: String(e.idEstacion), label: `${e.nombreEstacion} (${e.estadoEstacion})` }));

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!motivo.trim()) newErrors.motivo = 'El motivo es requerido';
    if (!fechaInicio) newErrors.fechaInicio = 'La fecha de inicio es requerida';
    // 'YYYY-MM-DD' strings compare chronologically.
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      newErrors.fechaFin = 'La fecha de fin no puede ser anterior a la fecha de inicio';
    }
    if (!targetId) newErrors.target = 'Seleccione la línea, parada o estación afectada';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        accion,
        motivo: motivo.trim(),
        fechaInicio,
        ...(fechaFin ? { fechaFin } : {}),
        [TARGET_ID_KEYS[targetType]]: targetId,
      } as CreateAfectacionDto);
    } catch (error: unknown) {
      setErrors({ submit: error instanceof Error && error.message ? error.message : 'Error al guardar la afectación' });
    } finally {
      setSubmitting(false);
    }
  };

  const ids = {
    tipo: `${uid}-tipo`,
    target: `${uid}-target`,
    motivo: `${uid}-motivo`,
    fechaInicio: `${uid}-fecha-inicio`,
    fechaFin: `${uid}-fecha-fin`,
    fechaFinHint: `${uid}-fecha-fin-hint`,
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <fieldset>
        <legend className="block text-sm font-medium text-slate-700 mb-2">Acción *</legend>
        <div className="flex gap-6">
          {[
            { value: AccionAfectacion.DESACTIVAR, label: 'Desactivar' },
            { value: AccionAfectacion.ACTIVAR, label: 'Activar' },
          ].map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name={`${uid}-accion`}
                value={option.value}
                checked={accion === option.value}
                onChange={() => setAccion(option.value)}
                className="w-4 h-4 text-primary focus:ring-2 focus:ring-primary"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={ids.tipo} className="block text-sm font-medium text-slate-700 mb-1">Afecta a *</label>
          <select
            id={ids.tipo}
            value={targetType}
            onChange={(e) => {
              setTargetType(e.target.value as TargetType);
              setTargetId('');
            }}
            className={FIELD_CLASS}
          >
            {(Object.keys(TARGET_LABELS) as TargetType[]).map((type) => (
              <option key={type} value={type}>{TARGET_LABELS[type]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.target} className="block text-sm font-medium text-slate-700 mb-1">
            {`${TARGET_LABELS[targetType]} *`}
          </label>
          <select id={ids.target} value={targetId} onChange={(e) => setTargetId(e.target.value)} className={FIELD_CLASS}>
            <option value="">{`Seleccionar ${TARGET_LABELS[targetType].toLowerCase()}`}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      {errors.target && <p className="text-red-600 text-xs -mt-2">{errors.target}</p>}

      <div>
        <label htmlFor={ids.motivo} className="block text-sm font-medium text-slate-700 mb-1">Motivo *</label>
        <textarea
          id={ids.motivo}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          className={`${FIELD_CLASS} resize-none`}
          placeholder="Describa el motivo de la afectación..."
        />
        {errors.motivo && <p className="text-red-600 text-xs mt-1">{errors.motivo}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={ids.fechaInicio} className="block text-sm font-medium text-slate-700 mb-1">Fecha inicio *</label>
          <input
            id={ids.fechaInicio}
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className={FIELD_CLASS}
          />
          {errors.fechaInicio && <p className="text-red-600 text-xs mt-1">{errors.fechaInicio}</p>}
        </div>
        <div>
          <label htmlFor={ids.fechaFin} className="block text-sm font-medium text-slate-700 mb-1">Fecha fin</label>
          <input
            id={ids.fechaFin}
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            aria-describedby={ids.fechaFinHint}
            className={FIELD_CLASS}
          />
          {errors.fechaFin && <p className="text-red-600 text-xs mt-1">{errors.fechaFin}</p>}
        </div>
      </div>
      <p id={ids.fechaFinHint} className="text-xs text-slate-500 -mt-2">
        Solo informativa: la afectación no se revierte automáticamente.
      </p>

      {errors.submit && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {errors.submit}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancelar</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">{submitting ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </form>
  );
}
