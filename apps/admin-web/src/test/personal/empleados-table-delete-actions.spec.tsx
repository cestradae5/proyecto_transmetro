import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmpleadosTable } from "../../features/personal/components/empleados/empleados-table";
import type { Empleado } from "../../features/personal/types/personal.types";

const ANA: Empleado = {
  id: "1",
  name: "Ana López",
  email: "ana@transmetro.test",
  status: "ACTIVO",
  roleId: "2",
  roleCode: "PILOTO",
  roleName: "Piloto",
  phone: null,
  dpi: "1234567890123",
  hireDate: null,
  address: null,
  licenseNumber: null,
  educationHistory: null,
  languages: null,
};
const LUIS: Empleado = { ...ANA, id: "2", name: "Luis Gómez", email: "luis@transmetro.test", status: "INACTIVO" };

describe("EmpleadosTable delete and status actions", () => {
  it("hides delete and toggle without canManage", () => {
    render(<EmpleadosTable empleados={[ANA]} onDelete={vi.fn()} onToggleStatus={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays read-only when the callbacks are not provided", () => {
    render(<EmpleadosTable empleados={[ANA]} canManage />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onDelete with the employee", () => {
    const onDelete = vi.fn();
    render(<EmpleadosTable empleados={[ANA]} canManage onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Ana López" }));
    expect(onDelete).toHaveBeenCalledWith(ANA);
  });

  it("labels the toggle by status and calls onToggleStatus", () => {
    const onToggleStatus = vi.fn();
    render(<EmpleadosTable empleados={[ANA, LUIS]} canManage onToggleStatus={onToggleStatus} />);
    fireEvent.click(screen.getByRole("button", { name: "Desactivar Ana López" }));
    expect(onToggleStatus).toHaveBeenLastCalledWith(ANA);
    fireEvent.click(screen.getByRole("button", { name: "Activar Luis Gómez" }));
    expect(onToggleStatus).toHaveBeenLastCalledWith(LUIS);
  });

  it("disables only the actions of pending rows", () => {
    render(
      <EmpleadosTable
        empleados={[ANA, LUIS]}
        canManage
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleStatus={vi.fn()}
        pendingIds={new Set(["1"])}
      />,
    );
    expect(screen.getByRole("button", { name: "Editar Ana López" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Desactivar Ana López" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Eliminar Ana López" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Activar Luis Gómez" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Eliminar Luis Gómez" })).toBeEnabled();
  });
});
