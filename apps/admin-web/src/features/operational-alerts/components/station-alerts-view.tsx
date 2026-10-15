import { useStationAlerts } from '../hooks/use-station-alerts';
import { AlertCard } from './alert-card';

const CHIP_CLASS = 'px-3 py-1 text-xs font-medium rounded-full border';
const CHIP_ON = 'bg-primary text-white border-primary';
const CHIP_OFF = 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50';

/**
 * Station operator inbox: alerts sent by units to the operator's station from
 * one of its ACTIVA lines. With several lines the operator can filter by one.
 */
export function StationAlertsView() {
  const { data, lineFilter, setLineFilter, noStation, loading, error, refresh, updateStatus } = useStationAlerts();

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
      <div className="flex items-center justify-between mb-3 gap-4">
        <h2 className="text-xl font-bold text-slate-900">{data.station.nombreEstacion}</h2>
        <span className={`px-2 py-1 text-xs font-medium rounded ${pendingCount > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
          {pendingCount} {pendingCount === 1 ? 'pendiente' : 'pendientes'}
        </span>
      </div>

      <div className="mb-6">
        {data.lineas.length === 0 ? (
          <p className="text-sm text-amber-700">
            La estación no tiene líneas activas: no recibirá alertas hasta que se le vincule una línea en Infraestructura.
          </p>
        ) : data.lineas.length === 1 ? (
          <p className="text-sm text-slate-600">Atiende: Línea {data.lineas[0]!.numeroLinea}</p>
        ) : (
          <div role="group" aria-label="Filtrar por línea" className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={lineFilter === null}
              onClick={() => setLineFilter(null)}
              className={`${CHIP_CLASS} ${lineFilter === null ? CHIP_ON : CHIP_OFF}`}
            >
              Todas
            </button>
            {data.lineas.map((linea) => (
              <button
                key={linea.idLinea}
                type="button"
                title={linea.nombreLinea}
                aria-pressed={lineFilter === linea.idLinea}
                onClick={() => setLineFilter(linea.idLinea)}
                className={`${CHIP_CLASS} ${lineFilter === linea.idLinea ? CHIP_ON : CHIP_OFF}`}
              >
                Línea {linea.numeroLinea}
              </button>
            ))}
          </div>
        )}
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
