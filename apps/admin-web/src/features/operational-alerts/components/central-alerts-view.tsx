import { useCentralAlerts } from '../hooks/use-central-alerts';
import type { Alerta, CentralAlertsEstacion, CentralAlertsLinea } from '../types';
import { AlertCard } from './alert-card';

function countPending(alerts: Alerta[]): number {
  return alerts.filter((a) => a.estadoAlerta === 'PENDIENTE').length;
}

function stationAlerts(estacion: CentralAlertsEstacion): Alerta[] {
  return estacion.unidades.flatMap((u) => u.alerts);
}

function lineLabel(linea: CentralAlertsLinea): string {
  return linea.numeroLinea === null ? linea.nombreLinea : `Línea ${linea.numeroLinea} · ${linea.nombreLinea}`;
}

function PendingBadge({ count, testId }: { count: number; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`px-2 py-1 text-xs font-medium rounded ${count > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}
    >
      {count} {count === 1 ? 'pendiente' : 'pendientes'}
    </span>
  );
}

/** Admin / central operator: every station's alerts grouped line -> station -> unit. */
export function CentralAlertsView() {
  const { data, loading, error, refresh, updateStatus } = useCentralAlerts();

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500">Cargando...</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
        <span>{error ?? 'No se pudieron cargar las alertas'}</span>
        <button onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
          Reintentar
        </button>
      </div>
    );
  }

  const allAlerts = data.lineas.flatMap((l) => l.estaciones.flatMap(stationAlerts));

  return (
    <>
      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          No se pudieron actualizar las alertas: {error}
        </div>
      )}
      <div className="flex items-center justify-between mb-6 gap-4">
        <h2 className="text-xl font-bold text-slate-900">Todas las estaciones</h2>
        <PendingBadge count={countPending(allAlerts)} testId="central-pending-count" />
      </div>

      {data.lineas.length === 0 ? (
        <p className="text-sm text-slate-500">No hay alertas registradas.</p>
      ) : (
        <div className="space-y-8">
          {data.lineas.map((linea) => (
            <section
              key={linea.idLinea ?? 'sin-linea'}
              aria-label={lineLabel(linea)}
              data-level="line"
              className="space-y-4"
            >
              <h3 className="text-lg font-bold text-slate-900 border-b border-slate-200 pb-2">{lineLabel(linea)}</h3>
              {linea.estaciones.map((estacion) => (
                <section
                  key={estacion.idEstacion}
                  aria-label={estacion.nombreEstacion}
                  className="pl-3 border-l-2 border-slate-200 space-y-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h4 className="font-semibold text-slate-800">{estacion.nombreEstacion}</h4>
                    <PendingBadge count={countPending(stationAlerts(estacion))} />
                  </div>
                  {estacion.unidades.map((unidad) => (
                    <div key={unidad.idUnidad} role="group" aria-label={`Unidad ${unidad.numeroPlaca}`} className="pl-3 space-y-2">
                      <p className="text-sm font-medium text-slate-600">Unidad {unidad.numeroPlaca}</p>
                      <ul className="space-y-3">
                        {unidad.alerts.map((alert) => (
                          <AlertCard key={alert.idAlerta} alert={alert} onUpdate={updateStatus} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
