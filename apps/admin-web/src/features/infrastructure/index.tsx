import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParadas } from './hooks/use-paradas';
import { useEstaciones } from './hooks/use-estaciones';
import { useParqueos } from './hooks/use-parqueos';
import { useLineas } from './hooks/use-lineas';
import { useAfectaciones } from './hooks/use-afectaciones';
import { ParadasTable } from './components/paradas/paradas-table';
import { EstacionesTable } from './components/estaciones/estaciones-table';
import { ParqueosTable } from './components/parqueos/parqueos-table';
import { LineasTable } from './components/lineas/lineas-table';
import { AfectacionesTable } from './components/afectaciones/afectaciones-table';
import { ParadaDialog } from './components/paradas/parada-dialog';
import { EstacionDialog } from './components/estaciones/estacion-dialog';

type Tab = 'paradas' | 'estaciones' | 'parqueos' | 'lineas' | 'afectaciones';

export function InfrastructurePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('paradas');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { paradas, loading: paradasLoading, createParada, updateParada, deleteParada } = useParadas();
  const { estaciones, loading: estacionesLoading, createEstacion, updateEstacion, deleteEstacion } = useEstaciones();
  const { parqueos, loading: parqueosLoading, updateParqueo, deleteParqueo } = useParqueos();
  const { lineas, loading: lineasLoading, updateLinea, deleteLinea } = useLineas();
  const { afectaciones, loading: afectacionesLoading, updateAfectacion, deleteAfectacion } = useAfectaciones();

  const tabs = [
    { id: 'paradas' as Tab, label: 'Paradas', count: paradas.length },
    { id: 'estaciones' as Tab, label: 'Estaciones', count: estaciones.length },
    { id: 'parqueos' as Tab, label: 'Parqueos', count: parqueos.length },
    { id: 'lineas' as Tab, label: 'Líneas', count: lineas.length },
    { id: 'afectaciones' as Tab, label: 'Afectaciones', count: afectaciones.length },
  ];

  const handleCreate = async (data: any) => {
    switch (activeTab) {
      case 'paradas':
        await createParada(data);
        break;
      case 'estaciones':
        await createEstacion(data);
        break;
    }
    setShowCreateDialog(false);
  };

  const isLoading = paradasLoading || estacionesLoading || parqueosLoading || lineasLoading || afectacionesLoading;

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

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-500">Cargando...</div>
            </div>
          ) : (
            <>
              {activeTab === 'paradas' && (
                <ParadasTable paradas={paradas} onUpdate={updateParada} onDelete={deleteParada} />
              )}
              {activeTab === 'estaciones' && (
                <EstacionesTable estaciones={estaciones} paradas={paradas} onUpdate={updateEstacion} onDelete={deleteEstacion} />
              )}
              {activeTab === 'parqueos' && (
                <ParqueosTable parqueos={parqueos} onUpdate={updateParqueo} onDelete={deleteParqueo} />
              )}
              {activeTab === 'lineas' && (
                <LineasTable lineas={lineas} onUpdate={updateLinea} onDelete={deleteLinea} />
              )}
              {activeTab === 'afectaciones' && (
                <AfectacionesTable afectaciones={afectaciones} onUpdate={updateAfectacion} onDelete={deleteAfectacion} />
              )}
            </>
          )}
        </div>
      </main>

      {showCreateDialog && activeTab === 'paradas' && (
        <ParadaDialog onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
      )}
      {showCreateDialog && activeTab === 'estaciones' && (
        <EstacionDialog paradas={paradas} onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  );
}
