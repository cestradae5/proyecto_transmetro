import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";

const MODULE_LABELS: Record<string, { icon: string; title: string; desc: string; color: string }> = {
  "fleet": { icon: "directions_bus", title: "Red de Movilidad", desc: "Gestión de flota, líneas y estaciones", color: "bg-lime-50/80 border-lime-200/70 text-lime-700 text-lime-900" },
  "gis": { icon: "map", title: "GIS", desc: "Visualización de rutas y estaciones", color: "bg-slate-50 border-slate-200 text-slate-600 text-slate-800" },
  "audit": { icon: "shield_check", title: "Auditoría", desc: "Reportes de auditoría y cumplimiento", color: "bg-blue-50/80 border-blue-200/70 text-blue-700 text-blue-900" },
  "report": { icon: "bar_chart", title: "Reportes", desc: "Generación de reportes y estadísticas", color: "bg-purple-50/80 border-purple-200/70 text-purple-700 text-purple-900" },
  "recharge": { icon: "credit_card", title: "Recarga", desc: "Gestión de recargas y pagos", color: "bg-emerald-50/80 border-emerald-200/70 text-emerald-700 text-emerald-900" },
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
              return (
                <div key={module} className={`p-5 rounded-2xl ${info.color} border`}>
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
