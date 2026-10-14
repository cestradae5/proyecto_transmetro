import { useState } from 'react';
import { formatReportDate } from '../../fleet/utils/format';
import { ESTADOS_ALERTA, TIPO_ALERTA_LABEL } from '../constants';
import { useStationAlerts } from '../hooks/use-station-alerts';
import type { Alerta, EstadoAlertaDestino } from '../types';
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

interface AlertCardProps {
  alert: Alerta;
  onUpdate: (idAlerta: string, estado: EstadoAlertaDestino, observacion?: string) => Promise<unknown>;
}

function AlertCard({ alert, onUpdate }: AlertCardProps) {
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
          </p>
          <p className="text-xs text-slate-500">
            {alert.autor.nombre} · {formatReportDate(alert.fechaCreacion)}
          </p>
        </div>
        <AlertStateBadge estado={alert.estadoAlerta} />
      </div>

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

/** Station operator inbox: alerts sent by units to the operator's station. */
export function StationAlertsView() {
  const { data, noStation, loading, error, refresh, updateStatus } = useStationAlerts();

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500">Cargando...</div>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
        <span>{error}</span>
        <button onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
          Reintentar
        </button>
      </div>
    );
  }
  if (noStation || !data) {
    return (
      <div className="py-12 text-center">
        <span className="material-symbols-outlined text-4xl text-slate-300">location_city</span>
        <p className="mt-2 text-slate-700 font-medium">No tiene una estación asignada.</p>
        <p className="text-sm text-slate-500">Las alertas de las unidades llegan a la estación que tenga asignada.</p>
      </div>
    );
  }

  const active = data.alerts.filter((a) => a.estadoAlerta !== 'RESUELTA');
  const resolved = data.alerts.filter((a) => a.estadoAlerta === 'RESUELTA');
  const pendingCount = data.alerts.filter((a) => a.estadoAlerta === 'PENDIENTE').length;

  return (
    <>
      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          No se pudieron actualizar las alertas: {error}
        </div>
      )}
      <div className="flex items-center justify-between mb-6 gap-4">
        <h2 className="text-xl font-bold text-slate-900">{data.station.nombreEstacion}</h2>
        <span className={`px-2 py-1 text-xs font-medium rounded ${pendingCount > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
          {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
        </span>
      </div>

      <section aria-label="Alertas activas" className="mb-8">
        <h3 className="text-lg font-bold text-slate-900 mb-3">Alertas activas</h3>
        {active.length === 0 ? (
          <p className="text-sm text-slate-500">No hay alertas activas para su estación.</p>
        ) : (
          <ul className="space-y-3">
            {active.map((alert) => (
              <AlertCard key={alert.idAlerta} alert={alert} onUpdate={updateStatus} />
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section aria-label="Resueltas">
          <h3 className="text-lg font-bold text-slate-900 mb-3">Resueltas</h3>
          <ul className="space-y-3">
            {resolved.map((alert) => (
              <AlertCard key={alert.idAlerta} alert={alert} onUpdate={updateStatus} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
