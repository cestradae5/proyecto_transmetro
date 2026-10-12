import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AUDIT_LOG_PAGE_SIZE, useAuditLog, useAuditLogOptions } from "./hooks/use-audit-log";
import { AuditLogTable } from "./components/audit-log-table";
import { AuditLogDetailDialog } from "./components/audit-log-detail-dialog";
import type { AuditLogEntry, AuditLogFilters, AuditResult } from "./types/audit-log.types";
import { moduleLabel, RESULT_LABELS } from "./utils/labels";

const USER_DEBOUNCE_MS = 300;
const EMPTY_FILTERS: AuditLogFilters = { from: "", to: "", user: "", module: "", action: "", result: "" };
const CONTROL =
  "px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30";

export function AuditLogPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<AuditLogFilters>(EMPTY_FILTERS);
  const [userInput, setUserInput] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  // Only the debounced text reaches the hook, so typing does not hit the API per keystroke.
  useEffect(() => {
    if (userInput === filters.user) return;
    const timer = setTimeout(() => {
      setPage(1);
      setFilters((prev) => ({ ...prev, user: userInput }));
    }, USER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [userInput, filters.user]);

  const { data, loading, error } = useAuditLog(filters, page);
  const { modules, actions } = useAuditLogOptions();

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));

  // Any filter change restarts from the first page in the same render.
  const setFilter = (key: keyof AuditLogFilters) => (value: string) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setUserInput("");
    setFilters(EMPTY_FILTERS);
  };

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <header className="w-full h-16 border-b border-slate-100 flex items-center justify-between px-6 lg:px-12 bg-white/95 backdrop-blur-sm z-30 shrink-0 fixed top-0 left-0">
        <div className="flex items-center gap-4">
          <button aria-label="Volver" onClick={() => navigate("/reports")} className="text-slate-600 hover:text-slate-900">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <span className="font-display font-bold text-xl text-primary">Transmetro</span>
        </div>
      </header>

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight mb-1">
            Bitácora ({total})
          </h1>
          <p className="text-sm text-slate-500 mb-6">Historial de acciones administrativas y de inicios de sesión. Solo lectura.</p>

          <div className="flex flex-wrap items-end gap-3 mb-4">
            <label className="flex flex-col text-xs text-slate-600 gap-1">
              Desde
              <input type="date" className={CONTROL} value={filters.from} max={filters.to || undefined}
                onChange={(e) => setFilter("from")(e.target.value)} />
            </label>
            <label className="flex flex-col text-xs text-slate-600 gap-1">
              Hasta
              <input type="date" className={CONTROL} value={filters.to} min={filters.from || undefined}
                onChange={(e) => setFilter("to")(e.target.value)} />
            </label>
            <label className="flex flex-col text-xs text-slate-600 gap-1">
              Usuario
              <input type="search" className={CONTROL} placeholder="Nombre o correo" value={userInput}
                onChange={(e) => setUserInput(e.target.value)} />
            </label>
            <label className="flex flex-col text-xs text-slate-600 gap-1">
              Módulo
              <select className={CONTROL} value={filters.module} onChange={(e) => setFilter("module")(e.target.value)}>
                <option value="">Todos</option>
                {modules.map((m) => <option key={m} value={m}>{moduleLabel(m)}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-xs text-slate-600 gap-1">
              Acción
              <select className={CONTROL} value={filters.action} onChange={(e) => setFilter("action")(e.target.value)}>
                <option value="">Todas</option>
                {actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label className="flex flex-col text-xs text-slate-600 gap-1">
              Resultado
              <select className={CONTROL} value={filters.result} onChange={(e) => setFilter("result")(e.target.value)}>
                <option value="">Todos</option>
                {(Object.keys(RESULT_LABELS) as AuditResult[]).map((r) => (
                  <option key={r} value={r}>{RESULT_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={clearFilters}
              className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200">
              Limpiar filtros
            </button>
          </div>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {loading && !data ? (
            <p className="py-8 text-center text-sm text-slate-500">Cargando bitácora…</p>
          ) : (
            !error && <AuditLogTable items={data?.items ?? []} onSelect={setSelected} />
          )}

          <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">
                Anterior
              </button>
              <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed">
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </main>

      {selected && <AuditLogDetailDialog entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
