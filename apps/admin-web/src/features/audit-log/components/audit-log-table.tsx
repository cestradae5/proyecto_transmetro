import type { AuditLogEntry } from "../types/audit-log.types";
import { formatAuditDate, moduleLabel, RESULT_LABELS, RESULT_STYLES } from "../utils/labels";

interface AuditLogTableProps {
  items: AuditLogEntry[];
  onSelect: (entry: AuditLogEntry) => void;
}

// Read-only on purpose (REQ-FUNC-012): rows only open the detail dialog.
export function AuditLogTable({ items, onSelect }: AuditLogTableProps) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No hay registros que coincidan con los filtros.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-100">
            <th className="pb-2 pr-4 font-medium">Fecha y hora</th>
            <th className="pb-2 pr-4 font-medium">Usuario</th>
            <th className="pb-2 pr-4 font-medium">Módulo</th>
            <th className="pb-2 pr-4 font-medium">Acción</th>
            <th className="pb-2 pr-4 font-medium">Entidad</th>
            <th className="pb-2 pr-4 font-medium">Resultado</th>
            <th className="pb-2 font-medium"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.id} className="border-b border-slate-50 align-top">
              <td className="py-2 pr-4 whitespace-nowrap">{formatAuditDate(entry.createdAt)}</td>
              <td className="py-2 pr-4">
                <span className="block text-slate-900">{entry.employee.name}</span>
                <span className="block text-xs text-slate-500">{entry.employee.email}</span>
              </td>
              <td className="py-2 pr-4">{moduleLabel(entry.module)}</td>
              <td className="py-2 pr-4 font-mono text-xs">{entry.action}</td>
              <td className="py-2 pr-4">{`${entry.entityType} #${entry.entityId}`}</td>
              <td className="py-2 pr-4">
                <span className={`inline-block px-2 py-0.5 rounded-full border text-xs ${RESULT_STYLES[entry.result] ?? ""}`}>
                  {RESULT_LABELS[entry.result] ?? entry.result}
                </span>
              </td>
              <td className="py-2 text-right">
                <button
                  type="button"
                  onClick={() => onSelect(entry)}
                  className="text-primary text-sm font-medium hover:underline"
                >
                  Ver detalle
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
