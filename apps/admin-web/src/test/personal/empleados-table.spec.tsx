import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmpleadosTable } from "../../features/personal/components/empleados/empleados-table";
import { formatHireDate, displayValue } from "../../features/personal/utils/format";
import type { Empleado } from "../../features/personal/types/personal.types";

function empleado(overrides: Partial<Empleado> = {}): Empleado {
  return {
    id: "1",
    name: "Ana López",
    email: "ana@transmetro.test",
    status: "ACTIVO",
    roleId: "2",
    roleCode: "PILOTO",
    roleName: "Piloto",
    phone: "55512345",
    dpi: "1234567890123",
    hireDate: "2024-03-05",
    address: null,
    licenseNumber: null,
    educationHistory: null,
    languages: null,
    ...overrides,
  };
}

describe("EmpleadosTable", () => {
  it("renders the column headers", () => {
    render(<EmpleadosTable empleados={[empleado()]} />);
    for (const name of ["Nombre", "Correo", "Rol", "DPI", "Teléfono", "Fecha de ingreso", "Estado"]) {
      expect(screen.getByRole("columnheader", { name })).toHaveAttribute("scope", "col");
    }
  });

  it("renders a row with employee data", () => {
    render(<EmpleadosTable empleados={[empleado()]} />);
    const row = screen.getByRole("row", { name: /Ana López/ });
    expect(within(row).getByText("ana@transmetro.test")).toBeInTheDocument();
    expect(within(row).getByText("Piloto")).toBeInTheDocument();
    expect(within(row).getByText("1234567890123")).toBeInTheDocument();
    expect(within(row).getByText("55512345")).toBeInTheDocument();
  });

  it("renders a placeholder for null values", () => {
    render(<EmpleadosTable empleados={[empleado({ phone: null, dpi: null, hireDate: null })]} />);
    const row = screen.getByRole("row", { name: /Ana López/ });
    expect(within(row).getAllByText("—")).toHaveLength(3);
  });

  it("formats the hire date without timezone shifting", () => {
    render(<EmpleadosTable empleados={[empleado({ hireDate: "2024-01-01" })]} />);
    expect(screen.getByText("01/01/2024")).toBeInTheDocument();
    expect(formatHireDate("2024-12-31")).toBe("31/12/2024");
    expect(formatHireDate("not-a-date")).toBe("not-a-date");
    expect(formatHireDate(null)).toBe("—");
    expect(displayValue("  ")).toBe("—");
  });

  it("renders status badges in Spanish", () => {
    render(
      <EmpleadosTable
        empleados={[
          empleado({ id: "1", name: "Ana", status: "ACTIVO" }),
          empleado({ id: "2", name: "Beto", status: "INACTIVO" }),
        ]}
      />,
    );
    expect(screen.getByText("Activo").className).toContain("bg-green-100");
    expect(screen.getByText("Inactivo").className).toContain("bg-slate-200");
  });
});
