// Route wiring for the Reportes hub and its submodules. The pages are covered
// in their own specs, so they are stubbed here.

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useAuth, type User } from "../../features/authentication/auth-context";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});
vi.mock("../../features/audit-log", () => ({ AuditLogPage: () => <div>Audit log page</div> }));
vi.mock("../../features/reports", () => ({
  ReportsHubPage: () => <div>Reports hub page</div>,
  AdministrativeReportsPage: () => <div>Administrative reports page</div>,
}));

import { App } from "../../app/app";

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

function renderApp(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const ALL = ["AUDITORIA_BITACORA_CONSULTAR", "REPORTES_ADMINISTRATIVOS_CONSULTAR"];

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("reports routes", () => {
  it.each([
    ["/reports", "Reports hub page"],
    ["/reports/audit-log", "Audit log page"],
    ["/reports/administrative", "Administrative reports page"],
  ])("renders %s for a user with module reports", (path, text) => {
    signIn(ALL);
    renderApp(path);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each(["/reports", "/reports/audit-log", "/reports/administrative"])(
    "redirects %s to /landing without module reports",
    (path) => {
      signIn(ALL, ["fleet"]);
      renderApp(path);
      expect(screen.getByText("Administration Dashboard")).toBeInTheDocument();
    },
  );

  it("redirects /reports/audit-log to the hub without AUDITORIA_BITACORA_CONSULTAR", () => {
    signIn(["REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    renderApp("/reports/audit-log");
    expect(screen.queryByText("Audit log page")).not.toBeInTheDocument();
    expect(screen.getByText("Reports hub page")).toBeInTheDocument();
  });

  it("redirects /reports/administrative to the hub without any report permission", () => {
    signIn([]);
    renderApp("/reports/administrative");
    expect(screen.getByText("Reports hub page")).toBeInTheDocument();
  });
});
