import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";
import { API_BASE_URL } from "../../platform/configuration/environment";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // Handle OAuth callback: /login?error=... or /login?code=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");

    if (errorParam === "denied") {
      setError("Acceso denegado. Tu cuenta no está autorizada.");
      window.history.replaceState({}, "", "/login");
    } else if (errorParam === "unavailable") {
      setError("Servicio de autenticación no disponible.");
      window.history.replaceState({}, "", "/login");
    }

    // If we landed here from callback (no error), check session
    const checkSession = async () => {
      try {
        const meResponse = await fetch(`${API_BASE_URL}/authentication/me`, {
          credentials: "include",
        });
        if (meResponse.ok) {
          const userData = await meResponse.json();
          login({
            email: userData.email,
            employeeId: userData.employeeId,
            roles: userData.roles,
            permissions: userData.permissions,
          });
          navigate("/landing");
        }
      } catch {
        // No session yet, stay on login
      }
    };
    checkSession();
  }, []);

  const handleGoogleLogin = () => {
    setError(null);
    // Redirect to backend → Google OAuth full page
    window.location.href = `${API_BASE_URL}/authentication/google`;
  };

  return (
    <div className="w-full h-screen bg-white text-slate-900 font-sans antialiased flex overflow-hidden">
      {/* <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <div className="flex items-center gap-2.5">
          <a href="#" className="flex items-center focus:outline-none">
            <span className="font-display font-bold text-xl text-primary">Transmetro</span>
          </a>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-slate-500">
          <button className="px-3 py-1.5 rounded-full text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1.5 border border-slate-200/70">
            <span className="material-symbols-outlined text-[16px] text-lime-700">support_agent</span>
            <span className="hidden sm:inline">Ayuda 1551</span>
          </button>
        </div>
      </header> */}

      <div className="flex-1 flex flex-col lg:flex-row w-full h-full overflow-y-auto lg:overflow-hidden">
        <main className="flex-1 flex flex-col items-center px-4 sm:px-8 py-8 lg:py-12 bg-[#fafbfc] relative min-h-screen lg:min-h-0">
          <div className="absolute top-0 left-0 w-full h-16 flex items-center px-6 lg:px-12 z-30">
          <span className="font-display font-bold text-xl text-primary"><img src="/public/images/Transmetro_Logo.png" alt="Transmetro Logo" width="350" height="40" /></span>
          </div>
          <div className="w-full max-w-[480px] my-auto flex flex-col items-center py-4">
            <div className="w-full bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04),0_20px_25px_-5px_rgba(15,23,42,0.02)] p-6 sm:p-11">
              <div className="text-center mb-8">
                <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight leading-snug">Iniciar Sesión</h1>
                <p className="text-slate-500 text-sm mt-2 font-normal leading-relaxed">Ingresa con tu cuenta institucional para continuar al Sistema Transmetro</p>
              </div>
              <div className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800">
                    <span className="material-symbols-outlined text-red-600 text-[18px] shrink-0">error</span>
                    <p className="text-xs font-medium leading-snug">{error}</p>
                  </div>
                )}
                <button
                  onClick={handleGoogleLogin}
                  className="group relative w-full flex items-center justify-between p-4 sm:py-4.5 sm:px-5 rounded-2xl bg-white hover:bg-slate-50/90 text-slate-800 border-2 border-slate-200/90 hover:border-[#0a257a] shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99] cursor-pointer"
                  id="google-login-btn"
                >
                  <div className="flex items-center gap-3.5 sm:gap-4">
                    <div className="w-8 h-8 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6 shrink-0 transition-transform duration-200 group-hover:scale-110" viewBox="0 0 24 24">
                        <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" fill="#4285F4" />
                        <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z" fill="#34A853" />
                        <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" fill="#FBBC05" />
                        <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335" />
                      </svg>
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-display font-bold text-[15px] sm:text-base text-slate-900 group-hover:text-[#0a257a] transition-colors leading-tight">Continuar con Google</span>
                      <span className="text-xs text-slate-500 font-normal mt-0.5">Cuenta institucional</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-slate-400 group-hover:text-[#0a257a] text-[22px] transition-all duration-200 group-hover:translate-x-1 shrink-0">arrow_forward</span>
                </button>
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-lime-50/80 border border-lime-200/70 text-lime-900">
                  <span className="material-symbols-outlined text-lime-700 text-[18px] shrink-0">lock</span>
                  <p className="text-xs font-medium leading-snug">Acceso exclusivo mediante credenciales autorizadas.</p>
                </div>
              </div>
            </div>
          </div>
          <footer className="w-full max-w-xl text-center pt-6 pb-2 shrink-0">
            <p className="text-[11px] text-slate-400">© 2026 Municipalidad de Guatemala · Dirección de Movilidad Urbana</p>
          </footer>
        </main>

        <aside className="flex flex-col justify-end w-full lg:w-[35%] xl:w-[30%] hero-ribbon-bg relative p-6 sm:p-8 xl:p-12 select-none shrink-0 min-h-[400px] lg:h-full self-stretch">
          {/* <div className="absolute top-6 right-6 z-30">
            <button className="px-3 py-1.5 rounded-full text-xs font-medium text-white hover:bg-white/20 transition-colors flex items-center gap-1.5 border border-white/30 backdrop-blur-sm">
              <span className="material-symbols-outlined text-[16px]">support_agent</span>
              <span className="hidden sm:inline">Ayuda 1551</span>
            </button>
          </div> */}
          <div className="wave-ribbon-1"></div>
          <div className="wave-ribbon-2"></div>
          <div className="ribbon-texture-lines"></div>
          <div className="relative z-10 w-full p-5 sm:p-6 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-2xl">
            <div className="flex items-center gap-3 mb-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#a6f875] text-[#001251] flex items-center justify-center shrink-0 shadow-sm">
                <span className="material-symbols-outlined text-[20px]">directions_bus</span>
              </div>
              <div>
                <div className="text-[11px] sm:text-xs uppercase tracking-wider font-semibold text-lime-300">Plataforma Web</div>
                <div className="font-display font-bold text-sm sm:text-[15px] text-white leading-tight">Transmetro Ciudad de Guatemala</div>
              </div>
            </div>
            <p className="text-xs text-white/80 leading-relaxed">Plataforma centralizada de gestión de flota, supervisión de lineas y estaciones.</p>
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-white/70">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#a6f875]"></span>Sistema Activo</span>
              <span>v1 Municipalidad</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
