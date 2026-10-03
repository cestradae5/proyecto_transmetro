import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEmpleados } from "./hooks/use-empleados";
import { useRoles } from "./hooks/use-roles";
import { useAuth } from "../authentication/auth-context";
import { canManageEmpleados } from "./permissions";
import { EmpleadosTable } from "./components/empleados/empleados-table";
import { EmpleadoDialog } from "./components/empleados/empleado-dialog";
import { ConfirmDeleteDialog } from "./components/empleados/confirm-delete-dialog";
import type {
  CreateEmpleadoPayload,
  Empleado,
  EmployeeStatus,
  UpdateEmpleadoPayload,
} from "./types/personal.types";

type DialogState = { mode: "create" } | { mode: "edit"; empleado: Empleado } | null;

const SEARCH_DEBOUNCE_MS = 300;
const CONTROL =
  "px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30";

export function PersonalPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = canManageEmpleados(user);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"" | EmployeeStatus>("");
  const [roleId, setRoleId] = useState("");

  // Only the debounced text reaches the hook, so typing does not hit the API per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { items, loading, error, refresh, create, update, delete: remove } = useEmpleados({
    search: debouncedSearch || undefined,
    status: status || undefined,
    roleId: roleId || undefined,
  });
  const { roles, error: rolesError } = useRoles();

  const hasActiveFilters = Boolean(debouncedSearch.trim() || status || roleId);

  // Quick status toggle: rows with a request in flight are disabled; failures show a page banner.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Empleado | null>(null);

  const handleToggleStatus = async (empleado: Empleado) => {
    const next: EmployeeStatus = empleado.status === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    setToggleError(null);
    setPendingIds((prev) => new Set(prev).add(empleado.id));
    try {
      await update(empleado.id, { status: next });
    } catch (err: unknown) {
      setToggleError(err instanceof Error ? err.message : "No se pudo cambiar el estado del empleado");
    } finally {
      setPendingIds((prev) => {
        const rest = new Set(prev);
        rest.delete(empleado.id);
        return rest;
      });
    }
  };

  // Errors thrown here reach the confirm dialog, which shows them and stays open.
  const handleConfirmDelete = async () => {
    if (!deleting) return;
    await remove(deleting.id);
    setDeleting(null);
  };

  const handleDeactivateInstead = async () => {
    if (!deleting) return;
    await update(deleting.id, { status: "INACTIVO" });
    setDeleting(null);
  };

  // Errors thrown here reach the form, which shows them and keeps the dialog open.
  const handleSave = async (payload: CreateEmpleadoPayload | UpdateEmpleadoPayload) => {
    if (dialog?.mode === "edit") {
      await update(dialog.empleado.id, payload);
    } else {
      await create(payload as CreateEmpleadoPayload);
    }
    setDialog(null);
  };

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

      <main className="pt-20 md:pt-24 px-4 sm:px-8 py-8 lg:py-12 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl border border-slate-200/70 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] p-6 sm:p-11">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display font-bold text-2xl sm:text-[28px] text-slate-900 tracking-tight">
              Personal ({items.length})
            </h1>
            {canManage && (
              <button
                onClick={() => setDialog({ mode: "create" })}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90"
              >
                Nuevo empleado
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <input
              type="search"
              aria-label="Buscar empleados"
              placeholder="Buscar por nombre, correo o DPI"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={`${CONTROL} flex-1 min-w-[220px]`}
            />
            <select
              aria-label="Filtrar por estado"
              value={status}
              onChange={(e) => setStatus(e.target.value as "" | EmployeeStatus)}
              className={CONTROL}
            >
              <option value="">Todos los estados</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
            <select
              aria-label="Filtrar por rol"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={Boolean(rolesError)}
              className={CONTROL}
            >
              <option value="">Todos los roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          {rolesError && (
            <div role="status" className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
              No se pudieron cargar los roles: {rolesError}. El filtro por rol no está disponible.
            </div>
          )}

          {error && items.length > 0 && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              No se pudo actualizar la lista: {error}
            </div>
          )}

          {toggleError && (
            <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
              <span>{toggleError}</span>
              <button
                onClick={() => setToggleError(null)}
                aria-label="Cerrar aviso"
                className="px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-100 rounded-lg"
              >
                Cerrar
              </button>
            </div>
          )}

          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-500">Cargando...</div>
            </div>
          ) : error && items.length === 0 ? (
            <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between gap-4">
              <span>{error}</span>
              <button onClick={() => refresh()} className="px-3 py-1 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100">
                Reintentar
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {hasActiveFilters
                ? "No se encontraron empleados con los filtros aplicados"
                : "Aún no hay empleados registrados"}
            </div>
          ) : (
            <EmpleadosTable
              empleados={items}
              canManage={canManage}
              onEdit={(empleado) => setDialog({ mode: "edit", empleado })}
              onDelete={(empleado) => setDeleting(empleado)}
              onToggleStatus={handleToggleStatus}
              pendingIds={pendingIds}
            />
          )}
        </div>

        {canManage && dialog && (
          <EmpleadoDialog
            empleado={dialog.mode === "edit" ? dialog.empleado : undefined}
            roles={roles}
            rolesError={rolesError}
            onSave={handleSave}
            onClose={() => setDialog(null)}
          />
        )}
        {canManage && deleting && (
          <ConfirmDeleteDialog
            empleado={deleting}
            onConfirm={handleConfirmDelete}
            onDeactivate={handleDeactivateInstead}
            onClose={() => setDeleting(null)}
          />
        )}
      </main>
    </div>
  );
}
