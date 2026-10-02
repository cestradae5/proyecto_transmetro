import type { Empleado, EmployeeStatus } from "../../types/personal.types";
import { displayValue, formatHireDate } from "../../utils/format";

interface EmpleadosTableProps {
  empleados: Empleado[];
  /** When true and `onEdit` is provided, an actions column is shown. */
  canManage?: boolean;
  onEdit?: (empleado: Empleado) => void;
}

const STATUS_BADGE: Record<EmployeeStatus, { label: string; className: string }> = {
  ACTIVO: { label: "Activo", className: "bg-green-100 text-green-700" },
  INACTIVO: { label: "Inactivo", className: "bg-slate-200 text-slate-600" },
};

const TH = "px-4 py-3 text-left text-sm font-semibold text-slate-700";
const TD = "px-4 py-3 text-sm text-slate-700";

export function EmpleadosTable({ empleados, canManage = false, onEdit }: EmpleadosTableProps) {
  const showActions = canManage && !!onEdit;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th scope="col" className={TH}>Nombre</th>
            <th scope="col" className={TH}>Correo</th>
            <th scope="col" className={TH}>Rol</th>
            <th scope="col" className={TH}>DPI</th>
            <th scope="col" className={TH}>Teléfono</th>
            <th scope="col" className={TH}>Fecha de ingreso</th>
            <th scope="col" className={TH}>Estado</th>
            {showActions && <th scope="col" className={TH}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {empleados.map((empleado) => {
            const badge = STATUS_BADGE[empleado.status];
            return (
              <tr key={empleado.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className={`${TD} font-medium text-slate-900`}>{empleado.name}</td>
                <td className={TD}>{empleado.email}</td>
                <td className={TD}>{displayValue(empleado.roleName)}</td>
                <td className={TD}>{displayValue(empleado.dpi)}</td>
                <td className={TD}>{displayValue(empleado.phone)}</td>
                <td className={TD}>{formatHireDate(empleado.hireDate)}</td>
                <td className={TD}>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      badge?.className ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {badge?.label ?? empleado.status}
                  </span>
                </td>
                {showActions && (
                  <td className={TD}>
                    <button
                      onClick={() => onEdit(empleado)}
                      aria-label={`Editar ${empleado.name}`}
                      className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Editar
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
