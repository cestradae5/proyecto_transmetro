import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConfirmDeleteDialog } from "../../features/personal/components/empleados/confirm-delete-dialog";
import type { Empleado } from "../../features/personal/types/personal.types";

const ANA: Empleado = {
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

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDeleteDialog>> = {}) {
  const onClose = vi.fn();
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onDeactivate = vi.fn().mockResolvedValue(undefined);
  render(
    <ConfirmDeleteDialog empleado={ANA} onConfirm={onConfirm} onDeactivate={onDeactivate} onClose={onClose} {...props} />,
  );
  return { onClose, onConfirm, onDeactivate };
}

describe("ConfirmDeleteDialog", () => {
  it("is an accessible alertdialog naming the employee and the alternative", () => {
    renderDialog();
    const dialog = screen.getByRole("alertdialog", { name: "Eliminar empleado" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("Ana López");
    expect(dialog).toHaveTextContent("permanente");
    expect(dialog).toHaveTextContent("desactívalo");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar en su lugar" })).not.toBeInTheDocument();
  });

  it("closes on Escape and on Cancel", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("calls onConfirm and disables every button while the request runs", async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { onClose } = renderDialog({ onConfirm });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const cancel = screen.getByRole("button", { name: "Cancelar" });
    await waitFor(() => expect(cancel).toBeDisabled());
    expect(screen.getByRole("button", { name: "Procesando..." })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    finish();
  });

  it("shows the thrown message in an alert and offers deactivation for an active employee", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Tiene historial: desactívalo en su lugar"));
    const { onDeactivate, onClose } = renderDialog({ onConfirm });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tiene historial: desactívalo en su lugar");
    expect(screen.getByRole("alertdialog")).toContainElement(alert);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Desactivar en su lugar" }));
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it("does not offer deactivation for an inactive employee", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Tiene historial"));
    renderDialog({ empleado: { ...ANA, status: "INACTIVO" }, onConfirm });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Desactivar en su lugar" })).not.toBeInTheDocument();
  });

  it("shows the error and stays open when deactivation fails", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Tiene historial"));
    const onDeactivate = vi.fn().mockRejectedValue(new Error("No se pudo desactivar"));
    renderDialog({ onConfirm, onDeactivate });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Desactivar en su lugar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo desactivar"));
    expect(screen.getByRole("button", { name: "Desactivar en su lugar" })).toBeEnabled();
  });
});
