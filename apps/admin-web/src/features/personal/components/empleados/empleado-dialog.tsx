import { useEffect, useId } from "react";
import type {
  CreateEmpleadoPayload,
  Empleado,
  PersonalRole,
  UpdateEmpleadoPayload,
} from "../../types/personal.types";
import { EmpleadoForm } from "./empleado-form";

interface EmpleadoDialogProps {
  empleado?: Empleado;
  roles: PersonalRole[];
  /** When set, the roles could not be loaded: the form is replaced by this message. */
  rolesError?: string | null;
  onSave: (payload: CreateEmpleadoPayload | UpdateEmpleadoPayload) => Promise<unknown>;
  onClose: () => void;
}

export function EmpleadoDialog({ empleado, roles, rolesError, onSave, onClose }: EmpleadoDialogProps) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <h2 id={titleId} className="text-xl font-bold text-slate-900 mb-4">
            {empleado ? "Editar empleado" : "Nuevo empleado"}
          </h2>
          {rolesError ? (
            <div className="space-y-4">
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                No se pudieron cargar los roles: {rolesError}. No es posible {empleado ? "editar" : "crear"} empleados hasta que se carguen.
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200">Cancelar</button>
              </div>
            </div>
          ) : (
            <EmpleadoForm empleado={empleado} roles={roles} onSubmit={onSave} onCancel={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
