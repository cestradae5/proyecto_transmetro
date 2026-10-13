import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AuditLogDetailDialog } from "../../features/audit-log/components/audit-log-detail-dialog";
import { ENTRY, LOGIN_FAILED } from "./fixtures";

describe("AuditLogDetailDialog", () => {
  it("shows the entry fields and the formatted detalle JSON", () => {
    render(<AuditLogDetailDialog entry={ENTRY} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Detalle del registro #10" })).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez (ana@transmetro.gt)")).toBeInTheDocument();
    expect(screen.getByText("Flota")).toBeInTheDocument();
    expect(screen.getByText("assign_pilot")).toBeInTheDocument();
    expect(screen.getByTestId("audit-detalle").textContent).toBe(
      JSON.stringify(ENTRY.detalle, null, 2),
    );
  });

  it("explains when there is no detalle", () => {
    render(<AuditLogDetailDialog entry={LOGIN_FAILED} onClose={vi.fn()} />);
    expect(screen.getByText("Este registro no tiene detalle adicional.")).toBeInTheDocument();
    expect(screen.queryByTestId("audit-detalle")).not.toBeInTheDocument();
  });

  it("shows 'Sistema' and no entity id for a failed login without employee", () => {
    render(<AuditLogDetailDialog entry={LOGIN_FAILED} onClose={vi.fn()} />);
    expect(screen.getByText("Sistema (intento de inicio de sesión)")).toBeInTheDocument();
    expect(screen.getByText("jwt")).toBeInTheDocument();
  });

  it("closes with the button and with Escape", () => {
    const onClose = vi.fn();
    render(<AuditLogDetailDialog entry={ENTRY} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
