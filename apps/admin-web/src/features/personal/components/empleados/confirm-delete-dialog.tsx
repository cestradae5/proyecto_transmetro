import { useEffect, useId, useState } from "react";
import type { Empleado } from "../../types/personal.types";

interface ConfirmDeleteDialogProps {
  empleado: Empleado;
  /** Runs the delete request; a rejection keeps the dialog open and shows its message. */
  onConfirm: () => Promise<unknown>;
  /** Runs the deactivation request. Only offered after a failed delete of an active employee. */
  onDeactivate: () => Promise<unknown>;
  onClose: () => void;
}

const messageOf = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : "No se pudo completar la operación";

export function ConfirmDeleteDialog({ empleado, onConfirm, onDeactivate, onClose }: ConfirmDeleteDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The deactivate shortcut is only relevant once a delete attempt has failed.
  const [deleteFailed, setDeleteFailed] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  const run = async (action: () => Promise<unknown>, isDelete: boolean) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err: unknown) {
      setError(messageOf(err));
      if (isDelete) setDeleteFailed(true);
      setPending(false);
    }
    // On success the parent unmounts the dialog, so there is nothing else to reset.
  };

  const canDeactivate = deleteFailed && empleado.status === "ACTIVO";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4"
      >
        <div className="p-6 space-y-4">
          <h2 id={titleId} className="text-xl font-bold text-slate-900">
            Eliminar empleado
          </h2>
          <p id={descriptionId} className="text-sm text-slate-700">
            ¿Seguro que deseas eliminar a <strong>{empleado.name}</strong>? Esta acción es permanente y no se puede
            deshacer. Si solo quieres que deje de operar, desactívalo en su lugar.
          </p>
          {error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
            >
              Cancelar
            </button>
            {canDeactivate && (
              <button
                type="button"
                onClick={() => run(onDeactivate, false)}
                disabled={pending}
                className="px-4 py-2 text-sm font-medium text-amber-800 bg-amber-100 rounded-lg hover:bg-amber-200 disabled:opacity-50"
              >
                Desactivar en su lugar
              </button>
            )}
            <button
              type="button"
              onClick={() => run(onConfirm, true)}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "Procesando..." : "Eliminar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
