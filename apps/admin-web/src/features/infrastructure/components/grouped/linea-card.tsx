import { useId, useState } from 'react';
import { EstadoLinea, TipoRecorrido, type Linea, type LineaParada, type Parada } from '../../types/infrastructure.types';
import { useLineaParadas } from '../../hooks/use-linea-paradas';
import { DANGER_LINK_BUTTON_CLASS, LINK_BUTTON_CLASS, RetryAlert, StatusBadge } from './group-card';

/** Page-level handlers: dialogs live in the page so refetches never unmount them. */
export interface LineaActions {
  onEdit: (linea: Linea) => void;
  onMunicipalidades: (linea: Linea) => void;
  onDeactivate: (linea: Linea) => void;
  onManage: (linea: Linea) => void;
  onEditParada: (parada: Parada) => void;
  onAccesos: (parada: Parada) => void;
  onEstacionLineas: (parada: Parada) => void;
}

interface LineaCardProps {
  linea: Linea;
  parqueoName: string;
  /** All paradas: current names, "Estación" badge and the full parada for dialogs. */
  paradas: Parada[];
  /** Label of the municipalidades action ("Vincular municipalidad" in "Sin municipalidad"). */
  municipalidadesLabel?: string;
  /** Bumped after "Gestionar paradas y parqueo" saves: remounts (and refetches) an open paradas list. */
  reloadKey: number;
  actions: LineaActions;
}

const TIPO_RECORRIDO_LABEL: Record<string, string> = {
  [TipoRecorrido.CIRCULAR]: 'Circular',
  [TipoRecorrido.LINEAL]: 'Lineal',
};

export function LineaCard({ linea, parqueoName, paradas, municipalidadesLabel = 'Municipalidades', reloadKey, actions }: LineaCardProps) {
  const uid = useId();
  const [expanded, setExpanded] = useState(false);
  const label = `${linea.numeroLinea} - ${linea.nombreLinea}`;
  const panelId = `${uid}-paradas`;

  return (
    <article aria-label={`Línea ${label}`} className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? panelId : undefined}
          aria-label={`${expanded ? 'Ocultar' : 'Ver'} paradas de la línea ${label}`}
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <span className="material-symbols-outlined text-slate-400" aria-hidden="true">
            {expanded ? 'expand_less' : 'expand_more'}
          </span>
          <span
            aria-hidden="true"
            className="h-6 w-6 shrink-0 rounded-md border border-slate-200"
            style={{ backgroundColor: linea.colorHex }}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{label}</span>
            <span className="block text-xs text-slate-500">
              {TIPO_RECORRIDO_LABEL[linea.tipoRecorrido] ?? linea.tipoRecorrido} · {parqueoName}
            </span>
          </span>
        </button>
        <StatusBadge estado={linea.estadoLinea} positive={linea.estadoLinea === EstadoLinea.ACTIVA} />
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" aria-label={`Editar línea ${label}`} onClick={() => actions.onEdit(linea)} className={LINK_BUTTON_CLASS}>
            Editar
          </button>
          <button
            type="button"
            aria-label={`${municipalidadesLabel} de la línea ${label}`}
            onClick={() => actions.onMunicipalidades(linea)}
            className={LINK_BUTTON_CLASS}
          >
            {municipalidadesLabel}
          </button>
          {linea.estadoLinea === EstadoLinea.ACTIVA && (
            <button
              type="button"
              aria-label={`Desactivar línea ${label}`}
              onClick={() => actions.onDeactivate(linea)}
              className={DANGER_LINK_BUTTON_CLASS}
            >
              Desactivar
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div id={panelId} className="border-t border-slate-100 px-4 py-3">
          <LineaParadasPanel key={reloadKey} linea={linea} label={label} paradas={paradas} actions={actions} />
        </div>
      )}
    </article>
  );
}

interface LineaParadasPanelProps {
  linea: Linea;
  label: string;
  paradas: Parada[];
  actions: LineaActions;
}

/** Mounted on expand only, so a línea's paradas are requested lazily. */
function LineaParadasPanel({ linea, label, paradas, actions }: LineaParadasPanelProps) {
  const { lineaParadas: rows, loading, error, refresh } = useLineaParadas(String(linea.idLinea));

  // The sequence endpoint returns the bare parada row; the full list carries
  // the current name and the derived esEstacion/idEstacion.
  const fullParada = (row: LineaParada): Parada =>
    paradas.find((p) => String(p.idParada) === String(row.idParada)) ?? {
      ...row.parada,
      esEstacion: false,
      idEstacion: null,
    };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">
          {loading && rows.length === 0 ? 'Cargando paradas...' : `${rows.length} ${rows.length === 1 ? 'parada' : 'paradas'}`}
        </p>
        <button
          type="button"
          aria-label={`Gestionar paradas y parqueo de la línea ${label}`}
          onClick={() => actions.onManage(linea)}
          className="rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/15 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Gestionar paradas y parqueo
        </button>
      </div>

      {error ? (
        <RetryAlert message={error} onRetry={() => void refresh()} />
      ) : !loading && rows.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
          Esta línea aún no tiene paradas. Agréguelas con «Gestionar paradas y parqueo».
        </p>
      ) : (
        <ol aria-label={`Paradas de la línea ${label}`} className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {rows.map((row, index) => {
            const parada = fullParada(row);
            const nombre = parada.nombreParada;
            return (
              <li key={row.idLineaParada} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {row.orden}
                </span>
                <span className="min-w-0 flex-1 text-sm text-slate-900">
                  {nombre}
                  {parada.esEstacion && (
                    <span className="ml-2 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Estación</span>
                  )}
                </span>
                {index < rows.length - 1 && (
                  <span className="text-xs text-slate-500">{row.minutosHastaSiguiente} min a la siguiente</span>
                )}
                <span className="flex flex-wrap items-center gap-1">
                  <button type="button" aria-label={`Editar parada ${nombre}`} onClick={() => actions.onEditParada(parada)} className={LINK_BUTTON_CLASS}>
                    Editar
                  </button>
                  <button type="button" aria-label={`Accesos de la parada ${nombre}`} onClick={() => actions.onAccesos(parada)} className={LINK_BUTTON_CLASS}>
                    Accesos
                  </button>
                  {parada.esEstacion && parada.idEstacion != null && (
                    <button
                      type="button"
                      aria-label={`Líneas de la estación ${nombre}`}
                      onClick={() => actions.onEstacionLineas(parada)}
                      className={LINK_BUTTON_CLASS}
                    >
                      Líneas de la estación
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
