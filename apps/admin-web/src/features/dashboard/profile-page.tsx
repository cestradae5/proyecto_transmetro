import { useNavigate } from "react-router-dom";
import { useAuth } from "../authentication/auth-context";
import { useProfile } from "./use-profile";

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-display font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading, error } = useProfile();

  if (!user) return null;

  const roleCode = profile?.role.code;
  const stationName = profile?.station?.nombreEstacion ?? "Sin asignar";
  const lineName = profile?.line
    ? `${profile.line.numeroLinea} - ${profile.line.nombreLinea}`
    : "Sin asignar";

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
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-6">
            Mi Perfil
          </h1>

          {loading && <p className="text-sm text-slate-500 mb-6">Cargando...</p>}
          {error && (
            <p role="alert" className="text-sm text-red-600 mb-6">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {profile && <InfoCard label="Nombre" value={profile.name} />}
            <InfoCard label="Correo Electrónico" value={profile?.email ?? user.email} />
            {profile && <InfoCard label="Rol" value={profile.role.name} />}
            {roleCode === "OPERADOR_ESTACION" && (
              <InfoCard label="Estación" value={stationName} />
            )}
            {roleCode === "PILOTO" && (
              <InfoCard label="Número de licencia" value={profile?.licenseNumber ?? "Sin registrar"} />
            )}
            {roleCode === "PILOTO" && <InfoCard label="Línea" value={lineName} />}
          </div>
        </div>
      </main>
    </div>
  );
}
