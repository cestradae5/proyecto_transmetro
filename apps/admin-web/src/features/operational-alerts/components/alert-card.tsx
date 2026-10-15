import { useState } from 'react';
import { formatReportDate } from '../../fleet/utils/format';
import { ESTADOS_ALERTA, TIPO_ALERTA_LABEL } from '../constants';
import type { Alerta, EstadoAlertaDestino } from '../types';
import { AlertObservations } from './alert-observations';
import { AlertStateBadge } from './alert-state-badge';

const ACTION_LABEL: Record<EstadoAlertaDestino, string> = {
  RECIBIDA: 'Marcar recibida',
  EN_ATENCION: 'En atención',
  RESUELTA: 'Resolver',
};

/** States after the current one, in lifecycle order (skipping forward is allowed). */
function forwardStates(alert: Alerta): EstadoAlertaDestino[] {
  return ESTADOS_ALERTA.slice(ESTADOS_ALERTA.indexOf(alert.estadoAlerta) + 1) as EstadoAlertaDestino[];
}

export interface AlertCardProps {
  alert: Alerta;
  onUpdate: (idAlerta: string, estado: EstadoAlertaDestino, observacion?: string) => Promise<unknown>;
}

/** One alert with its forward-only state actions (station inbox and central view). */
export function AlertCard({ alert, onUpdate }: AlertCardProps) {
  const [observacion, setObservacion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = forwardStates(alert);
  const isPendiente = alert.estadoAlerta === 'PENDIENTE';
  const observationId = `alert-observation-${alert.idAlerta}`;

  const handle = async (estado: EstadoAlertaDestino) => {
    setPending(true);
    setError(null);
    try {
      await onUpdate(alert.idAlerta, estado, observacion);
      setObservacion('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la alerta');
    } finally {
      setPending(false);
    }
  };

  return (
    <li className={`p-4 rounded-xl border ${isPendiente ? 'border-red-300 bg-red-50/60' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-slate-900">{TIPO_ALERTA_LABEL[alert.tipoAlerta] ?? alert.tipoAlerta}</p>
          <p className="text-sm text-slate-600">
            Unidad <span>{alert.unidad.numeroPlaca}</span>
            {alert.linea && (
              <>
                {' · '}
                <span title={alert.linea.nombreLinea}>Línea {alert.linea.numeroLinea}</span>
              </>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {alert.autor.nombre} · {formatReportDate(alert.fechaCreacion)}
          </p>
        </div>
        <AlertStateBadge estado={alert.estadoAlerta} />
      </div>

      <AlertObservations observaciones={alert.observaciones} />

      {error && (
        <div role="alert" className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-3">
          <label htmlFor={observationId} className="block text-xs font-medium text-slate-600 mb-1">
            Observación (opcional)
          </label>
          <textarea
            id={observationId}
            value={observacion}
            maxLength={500}
            rows={2}
            disabled={pending}
            onChange={(e) => setObservacion(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {actions.map((estado) => (
              <button
                key={estado}
                type="button"
                disabled={pending}
                onClick={() => handle(estado)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-60 ${
                  estado === 'RESUELTA'
                    ? 'bg-primary text-white hover:bg-primary/90'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {ACTION_LABEL[estado]}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
