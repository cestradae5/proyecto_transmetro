import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../lib/api-client";
import { useAuth } from "./auth-context";
import { userFromToken } from "./token-user";

interface DemoPersona {
  roleCode: string;
  roleName: string;
  employeeId: string;
  employeeName: string;
}

interface DemoPersonasResponse {
  actorEmail: string;
  impersonating: boolean;
  activeEmployeeId: string;
  personas: DemoPersona[];
}

// Demo role switch for academic review. The API answers 404/403 unless the
// feature is enabled and the reviewer is allowlisted; any failure keeps the
// switcher hidden, so regular users never see it.
export function DemoRoleSwitcher() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [data, setData] = useState<DemoPersonasResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<DemoPersonasResponse>("/authentication/demo/personas")
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.employeeId]);

  if (!data) return null;

  const applySession = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const { token } = await apiClient.post<{ token: string }>(path, body);
      login(token, userFromToken(token));
      navigate("/landing");
    } catch {
      setError("No se pudo cambiar de rol.");
    } finally {
      setBusy(false);
    }
  };

  const activePersona = data.personas.find((persona) => persona.employeeId === data.activeEmployeeId);

  return (
    <div className="flex items-center gap-2 text-xs">
      {data.impersonating && (
        <span className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
          Modo demo: {activePersona?.roleName ?? user?.scope.role} — {data.actorEmail}
        </span>
      )}
      <label htmlFor="demo-role-select" className="text-slate-500">
        Ver como
      </label>
      <select
        id="demo-role-select"
        disabled={busy}
        value={activePersona?.roleCode ?? ""}
        onChange={(event) => {
          if (event.target.value) {
            void applySession("/authentication/demo/switch", { roleCode: event.target.value });
          }
        }}
        className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700"
      >
        <option value="" disabled>
          Elegir rol…
        </option>
        {data.personas.map((persona) => (
          <option key={persona.roleCode} value={persona.roleCode}>
            {persona.roleName} ({persona.employeeName})
          </option>
        ))}
      </select>
      {data.impersonating && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void applySession("/authentication/demo/restore", {})}
          className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200"
        >
          Volver a mi cuenta
        </button>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
