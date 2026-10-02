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

describe("EmpleadosTable actions", () => {
  it("has no actions column by default", () => {
    render(<EmpleadosTable empleados={[ANA]} />);
    expect(screen.queryByRole("columnheader", { name: "Acciones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("has no actions column when canManage is false", () => {
    render(<EmpleadosTable empleados={[ANA]} canManage={false} onEdit={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onEdit with the employee when allowed", () => {
    const onEdit = vi.fn();
    render(<EmpleadosTable empleados={[ANA]} canManage onEdit={onEdit} />);
    expect(screen.getByRole("columnheader", { name: "Acciones" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar Ana López" }));
    expect(onEdit).toHaveBeenCalledWith(ANA);
  });
});
