import { useId, useState } from 'react';
import { EstadoUnidad } from '../../types/fleet.types';
import type { CreateUnidadDto, Unidad } from '../../types/fleet.types';

interface UnidadFormProps {
  unidad?: Unidad;
  onSubmit: (data: CreateUnidadDto) => Promise<void>;
  onCancel: () => void;
}

const INPUT_CLASS =
  'w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary';

function isInteger(value: string): boolean {
  return value.trim() !== '' && Number.isInteger(Number(value));
}

export function UnidadForm({ unidad, onSubmit, onCancel }: UnidadFormProps) {
  const isEdit = !!unidad;
  const uid = useId();
  const [formData, setFormData] = useState({
    numeroPlaca: unidad?.numeroPlaca ?? '',
    marca: unidad?.marca ?? '',
    modelo: unidad?.modelo ?? '',
    anio: unidad?.anio?.toString() ?? '',
    capacidadPasajeros: unidad?.capacidadPasajeros?.toString() ?? '',
    estadoUnidad: unidad?.estadoUnidad ?? EstadoUnidad.DISPONIBLE,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    const placa = formData.numeroPlaca.trim();
    if (!placa) newErrors.numeroPlaca = 'La placa es requerida';
    else if (placa.length > 20) newErrors.numeroPlaca = 'La placa no puede exceder 20 caracteres';

    const marca = formData.marca.trim();
    if (!marca) newErrors.marca = 'La marca es requerida';
    else if (marca.length > 60) newErrors.marca = 'La marca no puede exceder 60 caracteres';

    const modelo = formData.modelo.trim();
    if (!modelo) newErrors.modelo = 'El modelo es requerido';
    else if (modelo.length > 60) newErrors.modelo = 'El modelo no puede exceder 60 caracteres';

    if (!isInteger(formData.anio)) newErrors.anio = 'El año debe ser un número entero';

    if (!isInteger(formData.capacidadPasajeros) || Number(formData.capacidadPasajeros) < 1) {
      newErrors.capacidadPasajeros = 'La capacidad debe ser un entero mayor o igual a 1';
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
        numeroPlaca: formData.numeroPlaca.trim(),
        marca: formData.marca.trim(),
        modelo: formData.modelo.trim(),
        anio: Number(formData.anio),
        capacidadPasajeros: Number(formData.capacidadPasajeros),
        // Backend only accepts DISPONIBLE on create.
        estadoUnidad: isEdit ? formData.estadoUnidad : EstadoUnidad.DISPONIBLE,
      });
    } catch (error: unknown) {
      setErrors({ submit: error instanceof Error && error.message ? error.message : 'Error al guardar' });
    } finally {
      setSubmitting(false);
    }
  };

  const id = (name: string) => `${uid}-${name}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={id('numeroPlaca')} className="block text-sm font-medium text-slate-700 mb-1">Placa *</label>
        <input id={id('numeroPlaca')} type="text" value={formData.numeroPlaca} onChange={(e) => setFormData({ ...formData, numeroPlaca: e.target.value })} className={INPUT_CLASS} placeholder="ej: P-123ABC" />
        {errors.numeroPlaca && <p className="text-red-600 text-xs mt-1">{errors.numeroPlaca}</p>}
      </div>

      <div>
        <label htmlFor={id('marca')} className="block text-sm font-medium text-slate-700 mb-1">Marca *</label>
        <input id={id('marca')} type="text" value={formData.marca} onChange={(e) => setFormData({ ...formData, marca: e.target.value })} className={INPUT_CLASS} />
        {errors.marca && <p className="text-red-600 text-xs mt-1">{errors.marca}</p>}
      </div>

      <div>
        <label htmlFor={id('modelo')} className="block text-sm font-medium text-slate-700 mb-1">Modelo *</label>
        <input id={id('modelo')} type="text" value={formData.modelo} onChange={(e) => setFormData({ ...formData, modelo: e.target.value })} className={INPUT_CLASS} />
        {errors.modelo && <p className="text-red-600 text-xs mt-1">{errors.modelo}</p>}
      </div>

      <div>
        <label htmlFor={id('anio')} className="block text-sm font-medium text-slate-700 mb-1">Año *</label>
        <input id={id('anio')} type="number" value={formData.anio} onChange={(e) => setFormData({ ...formData, anio: e.target.value })} className={INPUT_CLASS} />
        {errors.anio && <p className="text-red-600 text-xs mt-1">{errors.anio}</p>}
      </div>

      <div>
        <label htmlFor={id('capacidadPasajeros')} className="block text-sm font-medium text-slate-700 mb-1">Capacidad de pasajeros *</label>
        <input id={id('capacidadPasajeros')} type="number" min={1} value={formData.capacidadPasajeros} onChange={(e) => setFormData({ ...formData, capacidadPasajeros: e.target.value })} className={INPUT_CLASS} />
        {errors.capacidadPasajeros && <p className="text-red-600 text-xs mt-1">{errors.capacidadPasajeros}</p>}
      </div>

      {isEdit ? (
        <div>
          <label htmlFor={id('estadoUnidad')} className="block text-sm font-medium text-slate-700 mb-1">Estado *</label>
          <select id={id('estadoUnidad')} value={formData.estadoUnidad} onChange={(e) => setFormData({ ...formData, estadoUnidad: e.target.value as EstadoUnidad })} className={INPUT_CLASS}>
            {Object.values(EstadoUnidad).map((estado) => (
              <option key={estado} value={estado}>{estado}</option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-slate-500">La unidad se crea con estado DISPONIBLE.</p>
      )}

      {errors.submit && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{errors.submit}</div>}

      <div className="flex justify-end gap-2 pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancelar</button>
        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50">{submitting ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </form>
  );
}
