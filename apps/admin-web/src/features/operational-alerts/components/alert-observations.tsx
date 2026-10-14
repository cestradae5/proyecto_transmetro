import { formatReportDate } from '../../fleet/utils/format';
import { ESTADO_ALERTA_LABEL } from '../constants';
import type { AlertaObservacion } from '../types';

/** State-change observations of an alert, oldest first (pilot, station and central views). Renders nothing when empty. */
export function AlertObservations({ observaciones }: { observaciones: AlertaObservacion[] }) {
  if (observaciones.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-slate-600 mb-1">Observaciones</p>
      <ul aria-label="Observaciones" className="space-y-2 border-l-2 border-slate-200 pl-3">
        {observaciones.map((obs, index) => (
          <li key={`${obs.fechaCambio}-${index}`} className="text-sm">
            <p className="text-slate-800 whitespace-pre-line break-words">{obs.observacion}</p>
            <span className="text-xs text-slate-500">
              {obs.autor.nombre} · {ESTADO_ALERTA_LABEL[obs.estadoNuevo] ?? obs.estadoNuevo} · {formatReportDate(obs.fechaCambio)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
