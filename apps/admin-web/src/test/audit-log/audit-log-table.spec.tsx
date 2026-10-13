import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AuditLogTable } from "../../features/audit-log/components/audit-log-table";
import { ENTRY, LOGIN_FAILED } from "./fixtures";

describe("AuditLogTable", () => {
  it("renders one row per entry with user, module label, action, entity and result", () => {
    render(<AuditLogTable items={[ENTRY, LOGIN_FAILED]} onSelect={vi.fn()} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByText("Ana Pérez")).toBeInTheDocument();
    expect(first.getByText("ana@transmetro.gt")).toBeInTheDocument();
    expect(first.getByText("Flota")).toBeInTheDocument();
    expect(first.getByText("assign_pilot")).toBeInTheDocument();
    expect(first.getByText("unidad #7")).toBeInTheDocument();
    expect(first.getByText("Exitoso")).toBeInTheDocument();
    const second = within(rows[1]!);
    expect(second.getByText("Autenticación")).toBeInTheDocument();
    expect(second.getByText("Fallido")).toBeInTheDocument();
  });

  it("renders a failed login without employee as 'Sistema' and its entity without id", () => {
    render(<AuditLogTable items={[LOGIN_FAILED]} onSelect={vi.fn()} />);

    const row = within(screen.getAllByRole("row")[1]!);
    expect(row.getByText("Sistema")).toBeInTheDocument();
    expect(row.getByText("Intento de inicio de sesión")).toBeInTheDocument();
    expect(row.getByText("jwt")).toBeInTheDocument();
    expect(row.queryByText(/#/)).not.toBeInTheDocument();
  });

  it("shows the empty state", () => {
    render(<AuditLogTable items={[]} onSelect={vi.fn()} />);
    expect(screen.getByText("No hay registros que coincidan con los filtros.")).toBeInTheDocument();
  });

  it("calls onSelect with the entry when 'Ver detalle' is clicked", () => {
    const onSelect = vi.fn();
    render(<AuditLogTable items={[ENTRY]} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }));
    expect(onSelect).toHaveBeenCalledWith(ENTRY);
  });

  it("offers no edit or delete actions (the log is read-only)", () => {
    render(<AuditLogTable items={[ENTRY]} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /editar|eliminar/i })).not.toBeInTheDocument();
  });
});
