import { ESTADO_ALERTA_BADGE, ESTADO_ALERTA_LABEL } from '../constants';
import type { EstadoAlerta } from '../types';

export function AlertStateBadge({ estado }: { estado: EstadoAlerta }) {
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${ESTADO_ALERTA_BADGE[estado] ?? 'bg-slate-100 text-slate-700'}`}>
      {ESTADO_ALERTA_LABEL[estado] ?? estado}
    </span>
  );
}
