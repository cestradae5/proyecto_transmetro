import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";
import { FLEET_MANAGE_PERMISSION, FLEET_STATION_VIEW_PERMISSION, hasPermission } from "../fleet/permissions";

// Keys MUST match PERMISSION_TO_MODULE values in
// apps/api/src/authentication/authentication.service.ts — a mismatch here
// silently drops a card (`if (!info) return null` below), caught by the
// completeness assertion in role-module-matrix.spec.ts.
const MODULE_LABELS: Record<string, { icon: string; title: string; desc: string; color: string }> = {
  "infrastructure": { icon: "map", title: "Infraestructura", desc: "Gestión de paradas, estaciones y parqueos", color: "bg-slate-50 border-slate-200 text-slate-600 text-slate-800" },
  "fleet": { icon: "directions_bus", title: "Flota", desc: "Gestión de unidades, líneas y asignaciones", color: "bg-lime-50/80 border-lime-200/70 text-lime-700 text-lime-900" },
  "personnel": { icon: "groups", title: "Personal", desc: "Administración de perfiles de empleados", color: "bg-sky-50/80 border-sky-200/70 text-sky-700 text-sky-900" },
  "operational_alerts": { icon: "warning", title: "Alertas Operativas", desc: "Gestión de alertas de estación y unidad", color: "bg-orange-50/80 border-orange-200/70 text-orange-700 text-orange-900" },
  "central_operations_panel": { icon: "dashboard", title: "Panel Operativo Central", desc: "Panel central de operaciones en tiempo real", color: "bg-indigo-50/80 border-indigo-200/70 text-indigo-700 text-indigo-900" },
  "reports": { icon: "bar_chart", title: "Reportes", desc: "Reportes administrativos, auditoría y cumplimiento", color: "bg-purple-50/80 border-purple-200/70 text-purple-700 text-purple-900" },
  "recharge_reporting": { icon: "credit_card", title: "Recarga", desc: "Gestión de recargas y pagos", color: "bg-emerald-50/80 border-emerald-200/70 text-emerald-700 text-emerald-900" },
  "self_profile": { icon: "person", title: "Perfil", desc: "Ver y editar tu perfil", color: "bg-amber-50/80 border-amber-200/70 text-amber-700 text-amber-900" },
};

export function LandingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const modules = user?.scope?.modules ?? [];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <span className="font-display font-bold text-xl text-primary">Transmetro</span>
        <span className="text-xs text-slate-500">{user?.email}</span>
      </header>

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-6xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-6">Administration Dashboard</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {modules.map((module) => {
              const info = MODULE_LABELS[module];
              if (!info) return null;
              
              // Without FLOTA_GESTIONAR the operator view would 403. A station
              // operator (FLOTA_ESTACION_CONSULTAR) goes to their station view;
              // a PILOTO (UNIDAD_ASIGNADA_CONSULTAR) goes to their unit view.
              const fleetDestination = () => {
                if (hasPermission(user, FLEET_MANAGE_PERMISSION)) return '/fleet';
                if (hasPermission(user, FLEET_STATION_VIEW_PERMISSION)) return '/fleet/my-station';
                return '/fleet/my-unit';
              };
              const handleClick = () => {
                if (module === 'infrastructure') {
                  navigate('/infrastructure');
                } else if (module === 'fleet') {
                  navigate(fleetDestination());
                } else if (module === 'personnel') {
                  navigate('/personal');
                }
              };
              const isNavigable = module === 'infrastructure' || module === 'fleet' || module === 'personnel';
              
              return (
                <div
                  key={module}
                  onClick={handleClick}
                  className={`p-5 rounded-2xl ${info.color} border ${isNavigable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-[22px]">{info.icon}</span>
                    <span className="font-display font-bold text-sm">{info.title}</span>
                  </div>
                  <p className="text-xs opacity-80">{info.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-100">
            <div className="text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#a6f875]"></span>Sistema Activo</span>
            </div>
            <button
              onClick={handleLogout}
              id="signout-btn"
              className="px-4 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors border border-red-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
