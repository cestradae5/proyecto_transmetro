import { useId, useState } from 'react';
import {
  EstadoLinea,
  TipoRecorrido,
  type CreateLineaDto,
  type Linea,
  type Municipalidad,
} from '../../types/infrastructure.types';
import {
  CARD_CLASS,
  ErrorAlert,
  FIELD_ERROR_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  errorMessage,
} from './wizard-ui';

// API DTO limits (numeroLinea maxLength 10, nombreLinea 120) and #RRGGBB color.
const NUMERO_MAX = 10;
const NOMBRE_MAX = 120;
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

interface StepLineaProps {
  municipalidad: Municipalidad;
  /** Línea already created by this wizard run (null before "Crear línea"). */
  linea: Linea | null;
  linked: boolean;
  createLinea: (data: CreateLineaDto) => Promise<Linea>;
  linkLinea: (lineaId: string) => Promise<unknown>;
  onLineaCreated: (linea: Linea) => void;
  onLinked: () => void;
}

export function StepLinea({ municipalidad, linea, linked, createLinea, linkLinea, onLineaCreated, onLinked }: StepLineaProps) {
  const uid = useId();
  const [formData, setFormData] = useState({
    numeroLinea: '',
    nombreLinea: '',
    colorHex: '#FF0000',
    tipoRecorrido: TipoRecorrido.LINEAL,
    estadoLinea: EstadoLinea.ACTIVA,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [linkError, setLinkError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const numero = formData.numeroLinea.trim();
    const nombre = formData.nombreLinea.trim();
    if (!numero) newErrors.numeroLinea = 'El número de línea es requerido';
    else if (numero.length > NUMERO_MAX) newErrors.numeroLinea = `El número no puede exceder ${NUMERO_MAX} caracteres`;
    if (!nombre) newErrors.nombreLinea = 'El nombre es requerido';
    else if (nombre.length > NOMBRE_MAX) newErrors.nombreLinea = `El nombre no puede exceder ${NOMBRE_MAX} caracteres`;
    if (!HEX_PATTERN.test(formData.colorHex)) {
      newErrors.colorHex = 'El color debe tener formato hexadecimal de 6 dígitos (ej: #FF0000)';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // The link is a separate request: when it fails the línea already exists, so
  // a retry only repeats the link (never the create).
  const link = async (target: Linea) => {
    setLinkError(null);
    try {
      await linkLinea(String(target.idLinea));
      onLinked();
    } catch (error: unknown) {
      setLinkError(errorMessage(error, 'Error al vincular la línea con la municipalidad'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      let created: Linea;
      try {
        created = await createLinea({
          numeroLinea: formData.numeroLinea.trim(),
          nombreLinea: formData.nombreLinea.trim(),
          colorHex: formData.colorHex,
          tipoRecorrido: formData.tipoRecorrido,
          estadoLinea: formData.estadoLinea,
          idParqueo: null,
        });
      } catch (error: unknown) {
        setErrors({ submit: errorMessage(error, 'Error al crear la línea') });
        return;
      }
      onLineaCreated(created);
      await link(created);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!linea) return;
    setSubmitting(true);
    try {
      await link(linea);
    } finally {
      setSubmitting(false);
    }
  };

  const titleId = `${uid}-title`;

  if (linea) {
    return (
      <section className={CARD_CLASS} aria-labelledby={titleId}>
        <h3 id={titleId} className="text-lg font-semibold text-slate-900">Línea</h3>
        <div className="mt-3 flex items-center gap-3">
          <span aria-hidden="true" className="h-6 w-6 rounded-full border border-slate-200" style={{ backgroundColor: linea.colorHex }} />
          <p className="text-sm text-slate-700">
            <span className="font-semibold">{linea.numeroLinea}</span> - {linea.nombreLinea}
            <span className="ml-2 text-xs text-slate-500">{`${linea.tipoRecorrido} · ${linea.estadoLinea}`}</span>
          </p>
        </div>
        {linked ? (
          <p className="mt-2 text-xs text-slate-500">{`Vinculada a la municipalidad ${municipalidad.nombreMunicipalidad}.`}</p>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-600">
              La línea fue creada, pero falta vincularla con {municipalidad.nombreMunicipalidad}.
            </p>
            <ErrorAlert message={linkError ?? (submitting ? null : 'La línea aún no está vinculada a la municipalidad.')}>
              <button type="button" onClick={handleRetry} disabled={submitting} className={SECONDARY_BUTTON_CLASS}>
                {submitting ? 'Vinculando...' : 'Reintentar vínculo'}
              </button>
            </ErrorAlert>
          </div>
        )}
      </section>
    );
  }

  const field = (name: string) => `${uid}-${name}`;

  return (
    <section className={CARD_CLASS} aria-labelledby={titleId}>
      <h3 id={titleId} className="text-lg font-semibold text-slate-900">Línea</h3>
      <p className="mt-1 mb-4 text-sm text-slate-500">
        {`La línea se creará sin parqueo y quedará vinculada a ${municipalidad.nombreMunicipalidad}. El parqueo y las paradas se asignan en el siguiente paso.`}
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={field('numero')} className={LABEL_CLASS}>Número de línea *</label>
            <input id={field('numero')} type="text" placeholder="ej: L1" value={formData.numeroLinea} onChange={(e) => setFormData({ ...formData, numeroLinea: e.target.value })} className={INPUT_CLASS} />
            {errors.numeroLinea && <p className={FIELD_ERROR_CLASS}>{errors.numeroLinea}</p>}
          </div>
          <div>
            <label htmlFor={field('nombre')} className={LABEL_CLASS}>Nombre *</label>
            <input id={field('nombre')} type="text" placeholder="ej: Línea Norte-Sur" value={formData.nombreLinea} onChange={(e) => setFormData({ ...formData, nombreLinea: e.target.value })} className={INPUT_CLASS} />
            {errors.nombreLinea && <p className={FIELD_ERROR_CLASS}>{errors.nombreLinea}</p>}
          </div>
          <div>
            <label htmlFor={field('color')} className={LABEL_CLASS}>Color *</label>
            <div className="flex gap-2">
              <input type="color" aria-label="Selector de color" value={HEX_PATTERN.test(formData.colorHex) ? formData.colorHex : '#000000'} onChange={(e) => setFormData({ ...formData, colorHex: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200" />
              <input id={field('color')} type="text" value={formData.colorHex} onChange={(e) => setFormData({ ...formData, colorHex: e.target.value })} className={`${INPUT_CLASS} font-mono`} />
            </div>
            {errors.colorHex && <p className={FIELD_ERROR_CLASS}>{errors.colorHex}</p>}
          </div>
          <div>
            <label htmlFor={field('tipo')} className={LABEL_CLASS}>Tipo de recorrido *</label>
            <select id={field('tipo')} value={formData.tipoRecorrido} onChange={(e) => setFormData({ ...formData, tipoRecorrido: e.target.value as TipoRecorrido })} className={INPUT_CLASS}>
              {Object.values(TipoRecorrido).map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={field('estado')} className={LABEL_CLASS}>Estado *</label>
            <select id={field('estado')} value={formData.estadoLinea} onChange={(e) => setFormData({ ...formData, estadoLinea: e.target.value as EstadoLinea })} className={INPUT_CLASS}>
              {Object.values(EstadoLinea).map((estado) => <option key={estado} value={estado}>{estado}</option>)}
            </select>
          </div>
        </div>

        <ErrorAlert message={errors.submit ?? null} />

        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className={PRIMARY_BUTTON_CLASS}>
            {submitting ? 'Creando...' : 'Crear línea'}
          </button>
        </div>
      </form>
    </section>
  );
}
