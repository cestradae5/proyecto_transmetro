import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../authentication/auth-context';
import { hasPermission } from '../../fleet/permissions';
import { ALERTS_CENTRAL_PERMISSION, ALERTS_STATION_PERMISSION, ALERTS_UNIT_PERMISSION } from '../permissions';
import { CentralAlertsView } from './central-alerts-view';
import { PilotAlertsView } from './pilot-alerts-view';
import { StationAlertsView } from './station-alerts-view';

/**
 * "/alerts": one screen per role, chosen by permission (module scope is enforced by the route guard).
 * The central view goes first: the admin holds every permission, pilot and station ones included.
 */
export function AlertsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const renderView = () => {
    if (hasPermission(user, ALERTS_CENTRAL_PERMISSION)) return <CentralAlertsView />;
    if (hasPermission(user, ALERTS_UNIT_PERMISSION)) return <PilotAlertsView />;
    if (hasPermission(user, ALERTS_STATION_PERMISSION)) return <StationAlertsView />;
    return (
      <div className="py-12 text-center">
        <span className="material-symbols-outlined text-4xl text-slate-300">warning</span>
        <p className="mt-2 text-slate-700 font-medium">Su rol no tiene una vista de alertas operativas en esta versión.</p>
      </div>
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
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-6">Alertas operativas</h1>
          {renderView()}
        </div>
      </main>
    </div>
  );
}
