import { useNavigate } from "react-router-dom";
import { useAuth } from "../authentication/auth-context";
import { canOpenReportsPage, canViewAuditLog } from "./permissions";

interface Submodule {
  path: string;
  icon: string;
  title: string;
  desc: string;
}

const AUDIT_LOG: Submodule = {
  path: "/reports/audit-log",
  icon: "history",
  title: "Bitácora",
  desc: "Historial de acciones administrativas e inicios de sesión.",
};

const ADMINISTRATIVE: Submodule = {
  path: "/reports/administrative",
  icon: "picture_as_pdf",
  title: "Reportes administrativos",
  desc: "Reportes de flota, personal, infraestructura, viajes, pagos y bitácora en PDF.",
};

/** Entry point of the Reportes module: one card per submodule the user may open. */
export function ReportsHubPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const submodules = [
    ...(canViewAuditLog(user) ? [AUDIT_LOG] : []),
    ...(canOpenReportsPage(user) ? [ADMINISTRATIVE] : []),
  ];

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <div className="flex items-center gap-4">
          <button aria-label="Volver" onClick={() => navigate("/landing")} className="text-slate-600 hover:text-slate-900">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <span className="font-display font-bold text-xl text-primary">Transmetro</span>
        </div>
      </header>

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-6xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-1">Reportes</h1>
          <p className="text-sm text-slate-500 mb-6">Seleccione un submódulo.</p>

          {submodules.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No tiene submódulos de reportes disponibles.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {submodules.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="text-left p-5 rounded-2xl bg-purple-50/80 border border-purple-200/70 text-purple-900 hover:shadow-md transition-shadow"
                >
                  <span className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-[22px] text-purple-700">{item.icon}</span>
                    <span className="font-display font-bold text-sm">{item.title}</span>
                  </span>
                  <span className="block text-xs opacity-80">{item.desc}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
