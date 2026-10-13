import { useEffect, useId } from "react";
import type { AuditLogEntry } from "../types/audit-log.types";
import {
  entityLabel,
  formatAuditDate,
  moduleLabel,
  RESULT_LABELS,
  SYSTEM_ACTOR_HINT,
  SYSTEM_ACTOR_LABEL,
} from "../utils/labels";

interface AuditLogDetailDialogProps {
  entry: AuditLogEntry;
  onClose: () => void;
}

export function AuditLogDetailDialog({ entry, onClose }: AuditLogDetailDialogProps) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const fields: Array<[string, string]> = [
    ["Fecha y hora", formatAuditDate(entry.createdAt)],
    [
      "Usuario",
      entry.employee
        ? `${entry.employee.name} (${entry.employee.email})`
        : `${SYSTEM_ACTOR_LABEL} (${SYSTEM_ACTOR_HINT.toLowerCase()})`,
    ],
    ["Módulo", moduleLabel(entry.module)],
    ["Acción", entry.action],
    ["Entidad", entityLabel(entry.entityType, entry.entityId)],
    ["Resultado", RESULT_LABELS[entry.result] ?? entry.result],
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6">
          <h2 id={titleId} className="text-xl font-bold text-slate-900 mb-4">
            Detalle del registro #{entry.id}
          </h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm mb-4">
            {fields.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-slate-900 break-words">{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Detalle</h3>
          {entry.detalle ? (
            <pre
              data-testid="audit-detalle"
              className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs overflow-x-auto"
            >{JSON.stringify(entry.detalle, null, 2)}</pre>
          ) : (
            <p className="text-sm text-slate-500">Este registro no tiene detalle adicional.</p>
          )}
          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
