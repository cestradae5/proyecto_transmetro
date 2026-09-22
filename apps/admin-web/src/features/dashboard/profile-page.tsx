import { useAuth } from "../authentication/auth-context";

export function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <span className="font-display font-bold text-xl text-primary">Transmetro</span>
      </header>

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-6xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-6">
            Mi Perfil
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">Correo Electrónico</p>
              <p className="font-display font-semibold text-slate-900">{user.email}</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">ID de Empleado</p>
              <p className="font-display font-semibold text-slate-900">{user.employeeId}</p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-100">
            <div className="text-xs text-slate-400">
              <span>Rol: </span>
              <span className="font-medium text-slate-600">{user.scope?.role ?? "—"}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
