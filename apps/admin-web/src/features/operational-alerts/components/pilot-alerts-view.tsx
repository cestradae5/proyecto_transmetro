import { useEffect, useState } from 'react';
import { formatReportDate } from '../../fleet/utils/format';
import { TIPO_ALERTA_LABEL, TIPOS_ALERTA } from '../constants';
import { usePilotAlerts } from '../hooks/use-pilot-alerts';
import type { Alerta, TipoAlerta } from '../types';
import { AlertObservations } from './alert-observations';
import { AlertStateBadge } from './alert-state-badge';

function EmptyState({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div className="py-12 text-center">
      <span className="material-symbols-outlined text-4xl text-slate-300">{icon}</span>
      <p className="mt-2 text-slate-700 font-medium">{title}</p>
      <p className="text-sm text-slate-500">{hint}</p>
    </div>
  );
}

function SentAlerts({ sent, sentError }: { sent: Alerta[]; sentError: string | null }) {
  return (
    <section aria-label="Mis alertas" className="mt-10">
      <h2 className="text-lg font-bold text-slate-900 mb-3">Mis alertas</h2>
      {sentError && (
        <div role="alert" className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          No se pudieron actualizar sus alertas: {sentError}
        </div>
      )}
      {sent.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no ha enviado alertas.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {sent.map((alert) => (
            <li key={alert.idAlerta} className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{TIPO_ALERTA_LABEL[alert.tipoAlerta] ?? alert.tipoAlerta}</p>
                  <p className="text-xs text-slate-500">
                    <span>{alert.estacionDestino.nombreEstacion}</span> · {formatReportDate(alert.fechaCreacion)}
                  </p>
                </div>
                <AlertStateBadge estado={alert.estadoAlerta} />
              </div>
              <AlertObservations observaciones={alert.observaciones} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pilot screen: pick a station of the unit's line and send a predefined alert. */
export function PilotAlertsView() {
  const { destinations, noUnit, noLine, loading, error, refresh, sent, sentError, sendAlert } = usePilotAlerts();
  const [idEstacion, setIdEstacion] = useState('');
  const [pendingType, setPendingType] = useState<TipoAlerta | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Preselect the suggested station once the destinations arrive.
  useEffect(() => {
    if (!destinations) return;
    const stillValid = destinations.destinations.some((d) => d.idEstacion === idEstacion);
    if (!stillValid) {
      const suggested = destinations.destinations.find((d) => d.suggested) ?? destinations.destinations[0];
      setIdEstacion(suggested?.idEstacion ?? '');
    }
  }, [destinations, idEstacion]);

  if (loading && !destinations) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500">Cargando...</div>
      </div>
    );
  }
  if (error && !destinations) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
        <span>{error}</span>
        <button onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
          Reintentar
        </button>
      </div>
    );
  }
  if (noUnit) {
    return <EmptyState icon="directions_bus" title="No tiene una unidad asignada." hint="Consulte con el operador de flota para poder enviar alertas." />;
  }
  if (noLine || !destinations) {
    return <EmptyState icon="route" title="Su unidad no tiene una línea asignada." hint="Las alertas se envían a estaciones de la línea de su unidad." />;
  }

  const stations = destinations.destinations;
  const selectedStation = stations.find((d) => d.idEstacion === idEstacion);
  const pendingLabel = pendingType ? TIPO_ALERTA_LABEL[pendingType] : '';

  const closeDialog = () => {
    setPendingType(null);
    setSendError(null);
  };

  const confirmSend = async () => {
    if (!pendingType || !selectedStation) return;
    setSending(true);
    setSendError(null);
    try {
      const created = await sendAlert(pendingType, selectedStation.idEstacion);
      setSuccess(`Alerta enviada a ${created.estacionDestino.nombreEstacion}.`);
      setPendingType(null);
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'No se pudo enviar la alerta');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <p className="text-sm text-slate-600 mb-6">
        Unidad {destinations.unidad.numeroPlaca} · {destinations.linea.nombreLinea}
      </p>

      {success && (
        <div role="status" className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
          {success}
        </div>
      )}

      {stations.length === 0 ? (
        <EmptyState icon="warning" title="La línea de su unidad no tiene estaciones para recibir alertas." hint="Consulte con el operador central." />
      ) : (
        <>
          <label htmlFor="alert-destination" className="block text-sm font-medium text-slate-700 mb-1">
            Estación de destino
          </label>
          <select
            id="alert-destination"
            value={idEstacion}
            onChange={(e) => setIdEstacion(e.target.value)}
            className="w-full mb-6 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            {stations.map((station) => (
              <option key={station.idEstacion} value={station.idEstacion}>
                {station.nombreEstacion}
                {station.suggested ? ' (más cercana)' : ''}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TIPOS_ALERTA.map((tipo) => (
              <button
                key={tipo.value}
                type="button"
                onClick={() => {
                  setSuccess(null);
                  setSendError(null);
                  setPendingType(tipo.value);
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-orange-200/70 bg-orange-50/80 text-orange-900 font-medium hover:shadow-md transition-shadow"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-3xl text-orange-700">{tipo.icon}</span>
                <span>{tipo.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <SentAlerts sent={sent} sentError={sentError} />

      {pendingType && selectedStation && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-40">
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-alert-title" className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h2 id="confirm-alert-title" className="text-lg font-bold text-slate-900 mb-2">Confirmar alerta</h2>
            <p className="text-sm text-slate-700 mb-4">
              ¿Enviar la alerta "{pendingLabel}" a {selectedStation.nombreEstacion}?
            </p>
            {sendError && (
              <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {sendError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={closeDialog} disabled={sending} className="px-4 py-2 text-slate-700 border border-slate-300 rounded-xl">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmSend}
                disabled={sending}
                className="px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-60"
              >
                {sending ? 'Enviando...' : 'Enviar alerta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
