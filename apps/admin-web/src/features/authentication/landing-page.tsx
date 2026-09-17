import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";

export function LandingPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 absolute top-0 left-0">
        <div className="flex items-center gap-2.5">
          <span className="font-display font-bold text-xl text-primary">Transmetro</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-xs text-slate-500">{user?.email}</span>
        </div>
      </header>

      <main className="pt-20 px-4 sm:px-8 py-8 lg:py-12 max-w-6xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-6">Administration Dashboard</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-5 rounded-2xl bg-lime-50/80 border border-lime-200/70">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-lime-700 text-[22px]">directions_bus</span>
                <span className="font-display font-bold text-sm text-lime-900">Red de Movilidad</span>
              </div>
              <p className="text-xs text-lime-800">Gestión de flota, líneas y estaciones</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-slate-600 text-[22px]">map</span>
                <span className="font-display font-bold text-sm text-slate-800">GIS</span>
              </div>
              <p className="text-xs text-slate-600">Visualización de rutas y estaciones</p>
            </div>
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
