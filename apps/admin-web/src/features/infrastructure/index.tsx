import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParadas } from './hooks/use-paradas';
import { useEstaciones } from './hooks/use-estaciones';
import { useParqueos } from './hooks/use-parqueos';
import { useLineas } from './hooks/use-lineas';
import { useAfectaciones } from './hooks/use-afectaciones';
import { useMunicipalidades } from './hooks/use-municipalidades';
import { saveParadaWithEstacion } from './hooks/save-parada-estacion';
import { MunicipalidadesTable } from './components/municipalidades/municipalidades-table';
import { ParadasTable } from './components/paradas/paradas-table';
import { ParqueosTable } from './components/parqueos/parqueos-table';
import { LineasTable } from './components/lineas/lineas-table';
import { AfectacionesTable } from './components/afectaciones/afectaciones-table';
import { AfectacionDialog } from './components/afectaciones/afectacion-dialog';
import { InfrastructureWizard } from './components/wizard/infrastructure-wizard';
import type { ParadaFormValues } from './types/infrastructure.types';

// Estaciones have no tab of their own: an estación is a 1:1 extension of a
// parada and is managed from the parada form ("Es estación").
type Tab = 'municipalidades' | 'lineas' | 'paradas' | 'parqueos' | 'afectaciones';

export function InfrastructurePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('municipalidades');
  const [showWizard, setShowWizard] = useState(false);
  const [showAfectacionDialog, setShowAfectacionDialog] = useState(false);

  const {
    municipalidades,
    loading: municipalidadesLoading,
    refresh: refreshMunicipalidades,
    updateMunicipalidad,
    deleteMunicipalidad,
  } = useMunicipalidades();
  const { paradas, loading: paradasLoading, refresh: refreshParadas, createParada, updateParada, deleteParada } = useParadas();
  const {
    estaciones,
    loading: estacionesLoading,
    refresh: refreshEstaciones,
    createEstacion,
    updateEstacion,
    deleteEstacion,
  } = useEstaciones();
  const { parqueos, loading: parqueosLoading, refresh: refreshParqueos, updateParqueo, deleteParqueo } = useParqueos();
  const { lineas, loading: lineasLoading, refresh: refreshLineas, updateLinea, deleteLinea } = useLineas();
  const { afectaciones, loading: afectacionesLoading, createAfectacion, updateAfectacion, deleteAfectacion } = useAfectaciones();

  // Creation flow order: Municipalidad -> Línea -> Parada/Estación -> Parqueo, then Afectaciones.
  const tabs = [
    { id: 'municipalidades' as Tab, label: 'Municipalidades', count: municipalidades.length },
    { id: 'lineas' as Tab, label: 'Líneas', count: lineas.length },
    { id: 'paradas' as Tab, label: 'Paradas', count: paradas.length },
    { id: 'parqueos' as Tab, label: 'Parqueos', count: parqueos.length },
    { id: 'afectaciones' as Tab, label: 'Afectaciones', count: afectaciones.length },
  ];

  // Editing an existing parada (and its estación) from the paradas table.
  const saveParada = (paradaId: number | string | null, values: ParadaFormValues) =>
    saveParadaWithEstacion(paradaId, values, {
      createParada,
      updateParada,
      createEstacion,
      updateEstacion,
      deleteEstacion,
      refreshParadas,
    });

  const handleCreateAfectacion = async (data: any) => {
    await createAfectacion(data);
    setShowAfectacionDialog(false);
  };

  // The wizard is the only creation path for municipalidades, líneas, paradas
  // and parqueos; it uses its own hook instances, so reload the tabs after it.
  const handleWizardClose = (saved: boolean) => {
    setShowWizard(false);
    if (!saved) return;
    void Promise.all([refreshMunicipalidades(), refreshLineas(), refreshParadas(), refreshParqueos(), refreshEstaciones()]);
  };

  const isLoading = municipalidadesLoading || paradasLoading || estacionesLoading || parqueosLoading || lineasLoading || afectacionesLoading;
  // Only replace the table while the active tab has nothing to show yet: a
  // background refetch (e.g. after saving a parada's estación) must not
  // unmount an open edit dialog.
  const activeCount = tabs.find((tab) => tab.id === activeTab)?.count ?? 0;
  const showLoading = isLoading && activeCount === 0;

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/landing')} className="text-slate-600 hover:text-slate-900">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <span className="font-display font-bold text-xl text-primary">Transmetro</span>
        </div>
      </header>

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight">
              Gestión de Infraestructura
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {activeTab === 'afectaciones' && (
                <button
                  onClick={() => setShowAfectacionDialog(true)}
                  className="px-4 py-2 text-slate-700 bg-slate-100 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                >
                  Nueva afectación
                </button>
              )}
              <button
                onClick={() => setShowWizard(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-semibold shadow-sm hover:bg-primary/90 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add</span>
                Nueva infraestructura
              </button>
            </div>
          </div>

          <div className="border-b border-slate-200 mb-6">
            <div className="flex gap-6 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 px-1 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>

          {showLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-500">Cargando...</div>
            </div>
          ) : (
            <>
              {activeTab === 'municipalidades' && (
                <MunicipalidadesTable
                  municipalidades={municipalidades}
                  onUpdate={updateMunicipalidad}
                  onDelete={deleteMunicipalidad}
                />
              )}
              {activeTab === 'lineas' && (
                <LineasTable
                  lineas={lineas}
                  parqueos={parqueos}
                  paradas={paradas}
                  municipalidades={municipalidades}
                  onUpdate={updateLinea}
                  onDelete={deleteLinea}
                />
              )}
              {activeTab === 'paradas' && (
                <ParadasTable
                  paradas={paradas}
                  estaciones={estaciones}
                  lineas={lineas}
                  onSave={saveParada}
                  onDelete={deleteParada}
                />
              )}
              {activeTab === 'parqueos' && (
                <ParqueosTable parqueos={parqueos} onUpdate={updateParqueo} onDelete={deleteParqueo} />
              )}
              {activeTab === 'afectaciones' && (
                <AfectacionesTable afectaciones={afectaciones} paradas={paradas} estaciones={estaciones} onUpdate={updateAfectacion} onDelete={deleteAfectacion} />
              )}
            </>
          )}
        </div>
      </main>

      {showWizard && <InfrastructureWizard onClose={handleWizardClose} />}
      {showAfectacionDialog && (
        <AfectacionDialog
          paradas={paradas}
          estaciones={estaciones}
          onSave={handleCreateAfectacion}
          onClose={() => setShowAfectacionDialog(false)}
        />
      )}
    </div>
  );
}
