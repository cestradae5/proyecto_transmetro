import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMiEstacion } from '../../hooks/use-mi-estacion';
import { EstadoUnidad, type MiEstacion, type MiEstacionLine, type MiEstacionUnit } from '../../types/fleet.types';
import { formatReportDate } from '../../utils/format';

/** Unit positions change while the operator watches the screen. */
const POLL_INTERVAL_MS = 30_000;

const ESTADO_LABEL: Record<string, string> = {
  [EstadoUnidad.DISPONIBLE]: 'Disponible',
  [EstadoUnidad.EN_SERVICIO]: 'En servicio',
  [EstadoUnidad.MANTENIMIENTO]: 'Mantenimiento',
  [EstadoUnidad.FUERA_DE_SERVICIO]: 'Fuera de servicio',
};

const ESTADO_BADGE: Record<string, string> = {
  [EstadoUnidad.DISPONIBLE]: 'bg-green-100 text-green-700',
  [EstadoUnidad.EN_SERVICIO]: 'bg-blue-100 text-blue-700',
  [EstadoUnidad.MANTENIMIENTO]: 'bg-amber-100 text-amber-700',
  [EstadoUnidad.FUERA_DE_SERVICIO]: 'bg-red-100 text-red-700',
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-1 text-sm text-slate-900">{children}</dd>
  </div>
);

function StationCard({ station }: { station: MiEstacion['station'] }) {
  return (
    <section aria-label="Estación" className="mb-8">
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="text-xl font-bold text-slate-900">{station.nombreEstacion}</h2>
        <span className="px-2 py-1 text-xs font-medium rounded bg-slate-100 text-slate-700">{station.estadoEstacion}</span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Coordenadas">
          {station.latitud}, {station.longitud}
        </Field>
        <Field label="Parada">{station.parada?.nombreParada ?? 'Sin parada asociada'}</Field>
      </dl>
    </section>
  );
}

function LineCard({ line }: { line: MiEstacionLine }) {
  const stops = [...line.stops].sort((a, b) => a.orden - b.orden);
  return (
    <article className="border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <span
          data-testid={`line-color-${line.idLinea}`}
          className="inline-block w-4 h-4 rounded-full border border-slate-200"
          style={{ backgroundColor: line.colorHex }}
        />
        <h3 className="font-bold text-slate-900">
          {line.numeroLinea} - {line.nombreLinea}
        </h3>
        <span className="ml-auto px-2 py-1 text-xs font-medium rounded bg-slate-100 text-slate-700">{line.tipoPunto}</span>
      </div>
      <ol className="space-y-1">
        {stops.map((stop) => (
          <li
            key={stop.idLineaParada}
            data-station-stop={stop.isStationStop}
            className={`text-sm px-2 py-1 rounded ${stop.isStationStop ? 'bg-primary/10 font-semibold text-slate-900' : 'text-slate-700'}`}
          >
            {stop.orden}. {stop.nombreParada}
            {stop.isStationStop && <span className="ml-2 text-xs text-primary">Esta estación</span>}
          </li>
        ))}
      </ol>
    </article>
  );
}

function UnitRow({ unit, lines }: { unit: MiEstacionUnit; lines: MiEstacionLine[] }) {
  const line = lines.find((l) => l.idLinea === unit.idLinea);
  const reportedAt = formatReportDate(unit.fechaReporteUbicacion);
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2 pr-4 font-medium text-slate-900">{unit.numeroPlaca}</td>
      <td className="py-2 pr-4">
        <span className={`px-2 py-1 text-xs font-medium rounded ${ESTADO_BADGE[unit.estadoUnidad] ?? 'bg-slate-100 text-slate-700'}`}>
          {ESTADO_LABEL[unit.estadoUnidad] ?? unit.estadoUnidad}
        </span>
      </td>
      <td className="py-2 pr-4">{line ? `${line.numeroLinea} - ${line.nombreLinea}` : unit.idLinea}</td>
      <td className="py-2 pr-4">{unit.idLineaParadaActual ? (unit.nombreParadaActual ?? unit.idLineaParadaActual) : 'Sin reporte'}</td>
      <td className="py-2 pr-4">{reportedAt ?? '—'}</td>
      <td className="py-2">{unit.pilotAssigned ? 'Sí' : 'No'}</td>
    </tr>
  );
}

/** Station operator self-service view of the assigned station ("Mi estación"). */
export function MiEstacionPage() {
  const navigate = useNavigate();
  const { data, noStation, loading, error, refresh } = useMiEstacion();

  useEffect(() => {
    const id = setInterval(() => {
      refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const renderContent = () => {
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
          <p className="text-sm text-slate-500">Consulte con el operador de flota.</p>
        </div>
      );
    }

    return (
      <>
        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            No se pudo actualizar la estación: {error}
          </div>
        )}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => refresh()}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            Actualizar
          </button>
        </div>

        <StationCard station={data.station} />

        <section aria-label="Líneas" className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Líneas</h2>
          {data.lines.length === 0 ? (
            <p className="text-sm text-slate-500">La estación no tiene líneas asignadas.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.lines.map((line) => (
                <LineCard key={line.idLinea} line={line} />
              ))}
            </div>
          )}
        </section>

        <section aria-label="Unidades">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Unidades</h2>
          {data.units.length === 0 ? (
            <p className="text-sm text-slate-500">No hay unidades en las líneas de la estación.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-4">Placa</th>
                    <th className="pb-2 pr-4">Estado</th>
                    <th className="pb-2 pr-4">Línea</th>
                    <th className="pb-2 pr-4">Parada actual</th>
                    <th className="pb-2 pr-4">Último reporte</th>
                    <th className="pb-2">Piloto asignado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.units.map((unit) => (
                    <UnitRow key={unit.idUnidad} unit={unit} lines={data.lines} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <div className="flex items-center gap-4">
          <button aria-label="Volver" onClick={() => navigate('/landing')} className="text-slate-600 hover:text-slate-900">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <span className="font-display font-bold text-xl text-primary">Transmetro</span>
        </div>
      </header>

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-5xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-6">Mi estación</h1>
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
