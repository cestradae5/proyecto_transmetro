import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth, type User } from "../../features/authentication/auth-context";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});

import { ReportsHubPage } from "../../features/reports";

const mockedUseAuth = useAuth as unknown as Mock;

function signIn(permissions: string[], modules: string[] = ["reports"]) {
  const user: User = {
    email: "user@transmetro.gt",
    employeeId: "emp-1",
    roles: ["OPERADOR_CENTRAL"],
    permissions,
    scope: { role: "OPERADOR_CENTRAL", modules },
  };
  mockedUseAuth.mockReturnValue({
    user,
    token: "fake-jwt",
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function renderHub() {
  return render(
    <MemoryRouter initialEntries={["/reports"]}>
      <Routes>
        <Route path="/reports" element={<ReportsHubPage />} />
        <Route path="/reports/audit-log" element={<div>Audit destination</div>} />
        <Route path="/reports/administrative" element={<div>Administrative destination</div>} />
        <Route path="/landing" element={<div>Landing destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ReportsHubPage", () => {
  it("shows both submodules for a user with both permissions", () => {
    signIn(["AUDITORIA_BITACORA_CONSULTAR", "REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    renderHub();
    expect(screen.getByRole("button", { name: /Bitácora/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reportes administrativos/ })).toBeInTheDocument();
  });

  it("hides the audit log for a user without AUDITORIA_BITACORA_CONSULTAR", () => {
    signIn(["REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    renderHub();
    expect(screen.queryByRole("button", { name: /Bitácora/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reportes administrativos/ })).toBeInTheDocument();
  });

  it("offers administrative reports to an auditor (the audit summary report)", () => {
    signIn(["AUDITORIA_BITACORA_CONSULTAR"]);
    renderHub();
    expect(screen.getByRole("button", { name: /Reportes administrativos/ })).toBeInTheDocument();
  });

  it("explains when no submodule is available", () => {
    signIn([]);
    renderHub();
    expect(screen.getByText("No tiene submódulos de reportes disponibles.")).toBeInTheDocument();
  });

  it.each([
    [/Bitácora/, "Audit destination"],
    [/Reportes administrativos/, "Administrative destination"],
  ])("navigates from %s", async (name, destination) => {
    signIn(["AUDITORIA_BITACORA_CONSULTAR", "REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    renderHub();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(await screen.findByText(destination)).toBeInTheDocument();
  });

  it("goes back to the landing page", async () => {
    signIn(["REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    renderHub();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByText("Landing destination")).toBeInTheDocument();
  });
});
