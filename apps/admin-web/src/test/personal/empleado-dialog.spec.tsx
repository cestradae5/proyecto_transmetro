import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EmpleadoDialog } from "../../features/personal/components/empleados/empleado-dialog";
import type { Empleado, PersonalRole } from "../../features/personal/types/personal.types";

const ROLES: PersonalRole[] = [{ id: "2", code: "PILOTO", name: "Piloto" }];

const EMPLEADO: Empleado = {
  id: "9",
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

function renderDialog(props: Partial<React.ComponentProps<typeof EmpleadoDialog>> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<EmpleadoDialog roles={ROLES} onSave={onSave} onClose={onClose} {...props} />);
  return { onClose, onSave };
}

describe("EmpleadoDialog", () => {
  it("is an accessible modal titled 'Nuevo empleado' in create mode", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Nuevo empleado" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("is titled 'Editar empleado' in edit mode and prefilled", () => {
    renderDialog({ empleado: EMPLEADO });
    expect(screen.getByRole("dialog", { name: "Editar empleado" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre/)).toHaveValue("Ana López");
  });

  it("closes on Escape", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Cancel", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("replaces the form with a message when roles failed to load", () => {
    const { onClose } = renderDialog({ rolesError: "roles down" });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los roles: roles down");
    expect(screen.queryByLabelText(/Nombre/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
