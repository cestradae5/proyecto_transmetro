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
import { MunicipalidadDialog } from './components/municipalidades/municipalidad-dialog';
import { ParadasTable } from './components/paradas/paradas-table';
import { ParqueosTable } from './components/parqueos/parqueos-table';
import { LineasTable } from './components/lineas/lineas-table';
import { AfectacionesTable } from './components/afectaciones/afectaciones-table';
import { ParadaDialog } from './components/paradas/parada-dialog';
import { ParqueoDialog } from './components/parqueos/parqueo-dialog';
import { LineaDialog } from './components/lineas/linea-dialog';
import { AfectacionDialog } from './components/afectaciones/afectacion-dialog';
import type { ParadaFormValues } from './types/infrastructure.types';

// Estaciones have no tab of their own: an estación is a 1:1 extension of a
// parada and is managed from the parada form ("Es estación").
type Tab = 'municipalidades' | 'lineas' | 'paradas' | 'parqueos' | 'afectaciones';

export function InfrastructurePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('municipalidades');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const {
    municipalidades,
    loading: municipalidadesLoading,
    createMunicipalidad,
    updateMunicipalidad,
    deleteMunicipalidad,
  } = useMunicipalidades();
  const { paradas, loading: paradasLoading, refresh: refreshParadas, createParada, updateParada, deleteParada } = useParadas();
  const { estaciones, loading: estacionesLoading, createEstacion, updateEstacion, deleteEstacion } = useEstaciones();
  const { parqueos, loading: parqueosLoading, createParqueo, updateParqueo, deleteParqueo } = useParqueos();
  const { lineas, loading: lineasLoading, createLinea, updateLinea, deleteLinea } = useLineas();
  const { afectaciones, loading: afectacionesLoading, createAfectacion, updateAfectacion, deleteAfectacion } = useAfectaciones();

  // Creation flow order: Municipalidad -> Línea -> Parada/Estación -> Parqueo, then Afectaciones.
  const tabs = [
    { id: 'municipalidades' as Tab, label: 'Municipalidades', count: municipalidades.length },
    { id: 'lineas' as Tab, label: 'Líneas', count: lineas.length },
    { id: 'paradas' as Tab, label: 'Paradas', count: paradas.length },
    { id: 'parqueos' as Tab, label: 'Parqueos', count: parqueos.length },
    { id: 'afectaciones' as Tab, label: 'Afectaciones', count: afectaciones.length },
  ];

  const saveParada = (paradaId: number | string | null, values: ParadaFormValues) =>
    saveParadaWithEstacion(paradaId, values, {
      createParada,
      updateParada,
      createEstacion,
      updateEstacion,
      deleteEstacion,
      refreshParadas,
    });

  const handleCreate = async (data: any) => {
    switch (activeTab) {
      case 'municipalidades':
        await createMunicipalidad(data);
        break;
      case 'paradas':
        await saveParada(null, data as ParadaFormValues);
        break;
      case 'parqueos':
        await createParqueo(data);
        break;
      case 'lineas':
        await createLinea(data);
        break;
      case 'afectaciones':
        await createAfectacion(data);
        break;
    }
    setShowCreateDialog(false);
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
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight">
              Gestión de Infraestructura
            </h1>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
            >
              Crear Nuevo
            </button>
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

      {showCreateDialog && activeTab === 'municipalidades' && (
        <MunicipalidadDialog onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
      )}
      {showCreateDialog && activeTab === 'lineas' && (
        <LineaDialog parqueos={parqueos} onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
      )}
      {showCreateDialog && activeTab === 'paradas' && (
        <ParadaDialog onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
      )}
      {showCreateDialog && activeTab === 'parqueos' && (
        <ParqueoDialog onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
      )}
      {showCreateDialog && activeTab === 'afectaciones' && (
        <AfectacionDialog paradas={paradas} estaciones={estaciones} onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  );
}
