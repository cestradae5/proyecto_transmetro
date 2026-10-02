import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../authentication/auth-context';
import { useMiUnidad } from '../../hooks/use-mi-unidad';
import { FLEET_REPORT_LOCATION_PERMISSION, hasPermission } from '../../permissions';
import { EstadoUnidad, type Unidad } from '../../types/fleet.types';
import { formatReportDate } from '../../utils/format';
import { ReportarUbicacionDialog } from './reportar-ubicacion-dialog';

const ESTADO_LABEL: Record<EstadoUnidad, string> = {
  [EstadoUnidad.DISPONIBLE]: 'Disponible',
  [EstadoUnidad.EN_SERVICIO]: 'En servicio',
  [EstadoUnidad.MANTENIMIENTO]: 'Mantenimiento',
  [EstadoUnidad.FUERA_DE_SERVICIO]: 'Fuera de servicio',
};

const ESTADO_BADGE: Record<EstadoUnidad, string> = {
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

function CurrentStop({ unit }: { unit: Unidad }) {
  if (!unit.idLineaParadaActual) return <>Sin reporte</>;
  const reportedAt = formatReportDate(unit.fechaReporteUbicacion);
  return (
    <>
      {unit.nombreParadaActual ?? unit.idLineaParadaActual}
      {reportedAt && <span className="block text-xs text-slate-500">Reportada el {reportedAt}</span>}
    </>
  );
}

/** Pilot self-service view of the assigned unit ("Mi unidad"). */
export function MiUnidadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canReport = hasPermission(user, FLEET_REPORT_LOCATION_PERMISSION);
  const [showReport, setShowReport] = useState(false);

  const { unit, noUnit, loading, error, refresh, stops, stopsLoading, stopsError, refreshStops, reportLocation } =
    useMiUnidad();

  const renderContent = () => {
    if (loading && !unit) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-500">Cargando...</div>
        </div>
      );
    }
    if (error && !unit) {
      return (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
          <span>{error}</span>
          <button onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
            Reintentar
          </button>
        </div>
      );
    }
    if (noUnit || !unit) {
      return (
        <div className="py-12 text-center">
          <span className="material-symbols-outlined text-4xl text-slate-300">directions_bus</span>
          <p className="mt-2 text-slate-700 font-medium">No tiene una unidad asignada.</p>
          <p className="text-sm text-slate-500">Consulte con el operador de flota.</p>
        </div>
      );
    }

    const hasLine = Boolean(unit.idLinea);
    return (
      <>
        {error && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            No se pudo actualizar la unidad: {error}
          </div>
        )}
        <div className="flex items-center justify-between mb-6 gap-4">
          <h2 className="text-xl font-bold text-slate-900">Unidad {unit.numeroPlaca}</h2>
          <span className={`px-2 py-1 text-xs font-medium rounded ${ESTADO_BADGE[unit.estadoUnidad] ?? 'bg-slate-100 text-slate-700'}`}>
            {ESTADO_LABEL[unit.estadoUnidad] ?? unit.estadoUnidad}
          </span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Marca / Modelo">
            {unit.marca} {unit.modelo}
          </Field>
          <Field label="Año">{unit.anio}</Field>
          <Field label="Capacidad">{unit.capacidadPasajeros} pasajeros</Field>
          <Field label="Línea">{hasLine ? (unit.nombreLinea ?? unit.idLinea) : 'Sin línea asignada'}</Field>
          {hasLine && (
            <Field label="Parada actual">
              <CurrentStop unit={unit} />
            </Field>
          )}
        </dl>

        {!hasLine && (
          <div role="status" className="mt-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            La unidad no tiene una línea asignada. No puede reportar su ubicación hasta que se le asigne una línea.
          </div>
        )}

        {hasLine && canReport && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => setShowReport(true)}
              className="px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
            >
              Reportar ubicación
            </button>
          </div>
        )}
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

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-3xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-6">Mi unidad</h1>
          {renderContent()}
        </div>
      </main>

      {showReport && unit && canReport && (
        <ReportarUbicacionDialog
          unit={unit}
          stops={stops}
          stopsLoading={stopsLoading}
          stopsError={stopsError}
          onRetryStops={() => refreshStops()}
          onReport={reportLocation}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
