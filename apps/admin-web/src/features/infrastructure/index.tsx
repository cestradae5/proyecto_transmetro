import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParadas } from './hooks/use-paradas';
import { useEstaciones } from './hooks/use-estaciones';
import { useParqueos } from './hooks/use-parqueos';
import { useLineas } from './hooks/use-lineas';
import { useAfectaciones } from './hooks/use-afectaciones';
import { useMunicipalidades } from './hooks/use-municipalidades';
import { useMunicipalidadLineas } from './hooks/use-municipalidad-lineas';
import { saveParadaWithEstacion } from './hooks/save-parada-estacion';
import { MunicipalidadDialog } from './components/municipalidades/municipalidad-dialog';
import { LineaDialog } from './components/lineas/linea-dialog';
import { LineaMunicipalidadesDialog } from './components/lineas/linea-municipalidades-dialog';
import { ParadaDialog } from './components/paradas/parada-dialog';
import { AccesosDialog } from './components/paradas/accesos-dialog';
import { AfectacionDialog } from './components/afectaciones/afectacion-dialog';
import { EstacionLineasDialog } from './components/estacion-lineas/estacion-lineas-dialog';
import { InfrastructureWizard } from './components/wizard/infrastructure-wizard';
import { GroupCard, DANGER_LINK_BUTTON_CLASS, LINK_BUTTON_CLASS, RetryAlert, StatusBadge } from './components/grouped/group-card';
import { LineaCard, type LineaActions } from './components/grouped/linea-card';
import { SecondarySections } from './components/grouped/secondary-sections';
import { filterGroup, normalizeSearch, resolveLineas, ungroupedLineas, type LineaGroup } from './components/grouped/grouping';
import { ErrorAlert } from './components/wizard/wizard-ui';
import {
  EstadoMunicipalidad,
  type Afectacion,
  type CreateAfectacionDto,
  type CreateMunicipalidadDto,
  type Linea,
  type Municipalidad,
  type Parada,
  type ParadaFormValues,
  type UpdateAfectacionDto,
  type UpdateLineaDto,
} from './types/infrastructure.types';

/** Groups start expanded only when there are few of them. */
const FEW_GROUPS = 3;

// Every dialog lives here (not inside the cards) so background refetches never unmount it.
type DialogState =
  | { kind: 'municipalidad'; municipalidad: Municipalidad }
  | { kind: 'linea'; linea: Linea }
  | { kind: 'lineaMunicipalidades'; linea: Linea }
  | { kind: 'parada'; parada: Parada }
  | { kind: 'accesos'; parada: Parada }
  | { kind: 'estacionLineas'; parada: Parada }
  | { kind: 'manage'; linea: Linea; municipalidad: Municipalidad | null }
  | { kind: 'wizard' }
  | { kind: 'afectacion'; afectacion?: Afectacion };

/**
 * Infrastructure page: a grouped view Municipalidad > Líneas > Paradas built
 * for review and editing. "Nueva infraestructura" (the wizard) is the only
 * creation path; parqueos, every parada and afectaciones sit below.
 */
export function InfrastructurePage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const {
    municipalidades,
    loading: municipalidadesLoading,
    error: municipalidadesError,
    refresh: refreshMunicipalidades,
    updateMunicipalidad,
    deleteMunicipalidad,
  } = useMunicipalidades();
  const { paradas, refresh: refreshParadas, createParada, updateParada, deleteParada } = useParadas();
  const { estaciones, refresh: refreshEstaciones, createEstacion, updateEstacion, deleteEstacion } = useEstaciones();
  const { parqueos, refresh: refreshParqueos, updateParqueo, deleteParqueo } = useParqueos();
  const { lineas, error: lineasError, refresh: refreshLineas, updateLinea, deleteLinea } = useLineas();
  const { afectaciones, refresh: refreshAfectaciones, createAfectacion, updateAfectacion } = useAfectaciones();

  const municipalidadIds = municipalidades.map((m) => String(m.idMunicipalidad));
  const memberships = useMunicipalidadLineas(municipalidadIds);

  const term = normalizeSearch(search);
  const groups: LineaGroup[] = municipalidades.map((municipalidad) => {
    const state = memberships.get(String(municipalidad.idMunicipalidad));
    return { municipalidad, lineas: resolveLineas(state.lineas, lineas), loading: state.loading, error: state.error };
  });
  // "Sin municipalidad" is only reliable once every municipalidad answered.
  const membershipsReady = groups.every((g) => !g.loading && !g.error);
  const ungrouped: LineaGroup = {
    municipalidad: null,
    lineas: membershipsReady ? ungroupedLineas(lineas, municipalidadIds.map(memberships.get)) : [],
    loading: false,
    error: null,
  };
  const visibleGroups = groups.flatMap((g) => filterGroup(g, term) ?? []);
  const visibleUngrouped = ungrouped.lineas.length > 0 ? filterGroup(ungrouped, term) : null;
  const defaultExpanded = groups.length + (ungrouped.lineas.length > 0 ? 1 : 0) <= FEW_GROUPS;

  const findEstacion = (parada: Parada) =>
    parada.idEstacion == null ? undefined : estaciones.find((e) => String(e.idEstacion) === String(parada.idEstacion));

  const parqueoName = (linea: Linea) => {
    if (linea.idParqueo == null) return 'Sin parqueo';
    const id = String(linea.idParqueo);
    return parqueos.find((p) => String(p.idParqueo) === id)?.nombreParqueo ?? `Parqueo #${id}`;
  };

  const saveParada = (paradaId: number | string | null, values: ParadaFormValues) =>
    saveParadaWithEstacion(paradaId, values, {
      createParada,
      updateParada,
      createEstacion,
      updateEstacion,
      deleteEstacion,
      refreshParadas,
    });

  const runAction = async (action: () => Promise<unknown>, fallback: string) => {
    setActionError(null);
    try {
      await action();
    } catch (err: unknown) {
      setActionError(err instanceof Error && err.message ? err.message : fallback);
    }
  };

  // Activating/deactivating cascades on the API (municipalidad -> líneas ->
  // paradas/estaciones) and records an afectación: refresh all of them.
  const refreshAfterStateChange = () =>
    void Promise.all([
      refreshMunicipalidades(),
      refreshLineas(),
      refreshParadas(),
      refreshEstaciones(),
      refreshAfectaciones(),
    ]);

  // DELETE is a soft delete on the API (estado -> INACTIVA), hence "Desactivar".
  const deactivateMunicipalidad = (municipalidad: Municipalidad) => {
    if (!confirm(`¿Está seguro de desactivar la municipalidad ${municipalidad.nombreMunicipalidad}?`)) return;
    return runAction(async () => {
      await deleteMunicipalidad(String(municipalidad.idMunicipalidad));
      refreshAfterStateChange();
    }, 'Error al desactivar la municipalidad');
  };

  const deactivateLinea = (linea: Linea) => {
    if (!confirm(`¿Está seguro de desactivar la línea ${linea.numeroLinea} - ${linea.nombreLinea}?`)) return;
    return runAction(() => deleteLinea(Number(linea.idLinea)), 'Error al desactivar la línea');
  };

  const reloadAfterSave = () => {
    setReloadKey((key) => key + 1);
    void Promise.all([
      refreshMunicipalidades(),
      refreshLineas(),
      refreshParadas(),
      refreshParqueos(),
      refreshEstaciones(),
      memberships.reloadAll(),
    ]);
  };

  // The wizard uses its own hook instances, so reload everything after it saved.
  const closeWizard = (saved: boolean) => {
    setDialog(null);
    if (saved) reloadAfterSave();
  };

  const lineaActions = (municipalidad: Municipalidad | null): LineaActions => ({
    onEdit: (linea) => setDialog({ kind: 'linea', linea }),
    onMunicipalidades: (linea) => setDialog({ kind: 'lineaMunicipalidades', linea }),
    onDeactivate: (linea) => void deactivateLinea(linea),
    onManage: (linea) => setDialog({ kind: 'manage', linea, municipalidad }),
    onEditParada: (parada) => setDialog({ kind: 'parada', parada }),
    onAccesos: (parada) => setDialog({ kind: 'accesos', parada }),
    onEstacionLineas: (parada) => setDialog({ kind: 'estacionLineas', parada }),
  });

  const renderLineas = (group: LineaGroup) =>
    group.lineas.map((linea) => (
      <LineaCard
        key={linea.idLinea}
        linea={linea}
        parqueoName={parqueoName(linea)}
        paradas={paradas}
        municipalidadesLabel={group.municipalidad ? 'Municipalidades' : 'Vincular municipalidad'}
        reloadKey={reloadKey}
        actions={lineaActions(group.municipalidad)}
      />
    ));

  const renderMunicipalidadGroup = (group: LineaGroup) => {
    const municipalidad = group.municipalidad!;
    const id = String(municipalidad.idMunicipalidad);
    const total = memberships.get(id);
    const activa = municipalidad.estadoMunicipalidad === EstadoMunicipalidad.ACTIVA;
    const name = municipalidad.nombreMunicipalidad;
    return (
      <GroupCard
        key={id}
        title={name}
        defaultExpanded={defaultExpanded}
        forceExpanded={term !== ''}
        meta={
          <>
            <span>{municipalidad.departamento}</span>
            <StatusBadge estado={municipalidad.estadoMunicipalidad} positive={activa} />
            <span>
              {total.loading && total.lineas.length === 0
                ? 'Cargando líneas...'
                : `${total.lineas.length} ${total.lineas.length === 1 ? 'línea' : 'líneas'}`}
            </span>
          </>
        }
        actions={
          <>
            <button
              type="button"
              aria-label={`Editar municipalidad ${name}`}
              onClick={() => setDialog({ kind: 'municipalidad', municipalidad })}
              className={LINK_BUTTON_CLASS}
            >
              Editar
            </button>
            {activa && (
              <button
                type="button"
                aria-label={`Desactivar municipalidad ${name}`}
                onClick={() => void deactivateMunicipalidad(municipalidad)}
                className={DANGER_LINK_BUTTON_CLASS}
              >
                Desactivar
              </button>
            )}
          </>
        }
      >
        {group.error ? (
          <RetryAlert message={group.error} onRetry={() => void memberships.reload(id)} />
        ) : group.loading && group.lineas.length === 0 ? (
          <p className="text-sm text-slate-500">Cargando líneas...</p>
        ) : group.lineas.length === 0 ? (
          <p className="rounded-xl bg-white px-4 py-5 text-center text-sm text-slate-500">
            Esta municipalidad aún no tiene líneas. Créelas con «Nueva infraestructura».
          </p>
        ) : (
          renderLineas(group)
        )}
      </GroupCard>
    );
  };

  const noMunicipalidades = !municipalidadesLoading && !municipalidadesError && municipalidades.length === 0;
  const nothingFound = term !== '' && visibleGroups.length === 0 && !visibleUngrouped;

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/landing')} aria-label="Volver" className="text-slate-600 hover:text-slate-900">
            <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          </button>
          <span className="font-display font-bold text-xl text-primary">Transmetro</span>
        </div>
      </header>

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight">
                Gestión de Infraestructura
              </h1>
              <p className="mt-1 text-sm text-slate-500">Municipalidades, sus líneas y las paradas de cada línea.</p>
            </div>
            <button
              type="button"
              onClick={() => setDialog({ kind: 'wizard' })}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-semibold shadow-sm hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add</span>
              Nueva infraestructura
            </button>
          </div>

          <div className="relative mt-6">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              aria-label="Buscar municipalidad o línea"
              placeholder="Buscar por municipalidad, nombre o número de línea..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="mt-6 space-y-4">
            <ErrorAlert message={actionError} />
            {municipalidadesError && <RetryAlert message={municipalidadesError} onRetry={() => void refreshMunicipalidades()} />}
            {lineasError && <RetryAlert message="No se pudieron cargar las líneas." onRetry={() => void refreshLineas()} />}

            {municipalidadesLoading && municipalidades.length === 0 && (
              <div role="status" className="space-y-3">
                <span className="sr-only">Cargando municipalidades...</span>
                {[0, 1].map((i) => (
                  <div key={i} aria-hidden="true" className="h-16 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            )}

            {noMunicipalidades && (
              <section aria-label="Sin municipalidades" className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
                <span className="material-symbols-outlined text-4xl text-slate-400" aria-hidden="true">location_city</span>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">Aún no hay municipalidades registradas</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                  La infraestructura se registra en orden: primero la municipalidad, luego su línea y por último las paradas y
                  el parqueo de esa línea. Use «Nueva infraestructura» para comenzar.
                </p>
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'wizard' })}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90"
                >
                  Nueva infraestructura
                </button>
              </section>
            )}

            {visibleGroups.map(renderMunicipalidadGroup)}

            {visibleUngrouped && (
              <GroupCard
                title="Sin municipalidad"
                defaultExpanded={defaultExpanded}
                forceExpanded={term !== ''}
                meta={<span>{`${ungrouped.lineas.length} ${ungrouped.lineas.length === 1 ? 'línea' : 'líneas'}`}</span>}
                hint="Estas líneas provienen de datos anteriores y no están vinculadas a ninguna municipalidad. Use «Vincular municipalidad» en cada línea para asignarla."
              >
                {renderLineas(visibleUngrouped)}
              </GroupCard>
            )}

            {nothingFound && (
              <p className="py-6 text-center text-sm text-slate-500">{`No hay municipalidades ni líneas que coincidan con «${search.trim()}».`}</p>
            )}
          </div>
        </div>

        <SecondarySections
          parqueos={parqueos}
          paradas={paradas}
          estaciones={estaciones}
          municipalidades={municipalidades}
          lineas={lineas}
          afectaciones={afectaciones}
          onUpdateParqueo={updateParqueo}
          onDeleteParqueo={deleteParqueo}
          onSaveParada={saveParada}
          onDeleteParada={deleteParada}
          onNewAfectacion={() => setDialog({ kind: 'afectacion' })}
          onEditAfectacion={(afectacion) => setDialog({ kind: 'afectacion', afectacion })}
        />
      </main>

      {dialog?.kind === 'wizard' && <InfrastructureWizard onClose={closeWizard} />}
      {dialog?.kind === 'manage' && (
        <InfrastructureWizard initialLinea={dialog.linea} initialMunicipalidad={dialog.municipalidad} onClose={closeWizard} />
      )}
      {dialog?.kind === 'municipalidad' && (
        <MunicipalidadDialog
          municipalidad={dialog.municipalidad}
          onSave={async (data: CreateMunicipalidadDto) => {
            await updateMunicipalidad(String(dialog.municipalidad.idMunicipalidad), data);
            setDialog(null);
            // An estado change cascades like a deactivation/activation.
            refreshAfterStateChange();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'linea' && (
        <LineaDialog
          linea={dialog.linea}
          parqueos={parqueos}
          onSave={async (data: UpdateLineaDto) => {
            await updateLinea(dialog.linea.idLinea, data);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'lineaMunicipalidades' && (
        <LineaMunicipalidadesDialog
          linea={dialog.linea}
          municipalidades={municipalidades}
          onClose={() => {
            setDialog(null);
            // Links may have changed: regroup.
            void memberships.reloadAll();
          }}
        />
      )}
      {dialog?.kind === 'parada' && (
        <ParadaDialog
          parada={dialog.parada}
          estacion={findEstacion(dialog.parada)}
          onSave={async (values) => {
            await saveParada(dialog.parada.idParada, values);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'accesos' && <AccesosDialog parada={dialog.parada} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'estacionLineas' && dialog.parada.idEstacion != null && (
        <EstacionLineasDialog
          stationId={String(dialog.parada.idEstacion)}
          stationName={findEstacion(dialog.parada)?.nombreEstacion ?? dialog.parada.nombreParada}
          lineas={lineas}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'afectacion' && (
        <AfectacionDialog
          municipalidades={municipalidades}
          lineas={lineas}
          paradas={paradas}
          estaciones={estaciones}
          afectacion={dialog.afectacion}
          onSave={async (data) => {
            // A rejection propagates to the form, which shows it and stays open.
            if (dialog.afectacion) {
              await updateAfectacion(dialog.afectacion.idAfectacion, data as UpdateAfectacionDto);
            } else {
              await createAfectacion(data as CreateAfectacionDto);
            }
            setDialog(null);
            refreshAfterStateChange();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
