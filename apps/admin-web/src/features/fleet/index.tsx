import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authentication/auth-context';
import { useUnidades } from './hooks/use-unidades';
import { FLEET_MANAGE_PERMISSION, hasPermission } from './permissions';
import { UnidadesTable } from './components/unidades/unidades-table';
import { UnidadDialog } from './components/unidades/unidad-dialog';
import type { CreateUnidadDto } from './types/fleet.types';

export function FleetPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = hasPermission(user, FLEET_MANAGE_PERMISSION);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { items, loading, error, refresh, createUnidad, updateUnidad, deleteUnidad } = useUnidades();

  const handleCreate = async (data: CreateUnidadDto) => {
    await createUnidad(data);
    setShowCreateDialog(false);
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

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight">
              Gestión de Flota ({items.length})
            </h1>
            {canManage && (
              <button
                onClick={() => setShowCreateDialog(true)}
                className="px-4 py-2 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors"
              >
                Nueva Unidad
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-500">Cargando...</div>
            </div>
          ) : error ? (
            <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
              <span>{error}</span>
              <button onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
                Reintentar
              </button>
            </div>
          ) : (
            <UnidadesTable
              unidades={items}
              canManage={canManage}
              onUpdate={updateUnidad}
              onDelete={deleteUnidad}
            />
          )}
        </div>
      </main>

      {showCreateDialog && canManage && (
        <UnidadDialog onSave={handleCreate} onClose={() => setShowCreateDialog(false)} />
      )}
    </div>
  );
}
