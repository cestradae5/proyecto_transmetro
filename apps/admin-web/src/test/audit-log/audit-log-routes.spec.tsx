// Route wiring for /reports: requires module "reports". The page itself is
// covered in audit-log-page.spec.tsx, so it is stubbed here.

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useAuth } from "../../features/authentication/auth-context";
import type { User } from "../../features/authentication/auth-context";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});
vi.mock("../../features/audit-log", () => ({ AuditLogPage: () => <div>Audit log page</div> }));

import { App } from "../../app/app";

const mockedUseAuth = useAuth as unknown as Mock;

function user(modules: string[]): User {
  return {
    email: "user@transmetro.gt",
    employeeId: "emp-1",
    roles: ["OPERADOR_CENTRAL"],
    permissions: [],
    scope: { role: "OPERADOR_CENTRAL", modules },
  };
}

function signIn(u: User | null) {
  mockedUseAuth.mockReturnValue({
    user: u,
    token: "fake-jwt",
    isAuthenticated: u !== null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function renderApp(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("audit log routes", () => {
  it("renders AuditLogPage at /reports for a user with module reports", () => {
    signIn(user(["reports"]));
    renderApp("/reports");
    expect(screen.getByText("Audit log page")).toBeInTheDocument();
  });

  it("redirects /reports to /landing when the user lacks module reports", () => {
    signIn(user(["fleet"]));
    renderApp("/reports");
    expect(screen.queryByText("Audit log page")).not.toBeInTheDocument();
    expect(screen.getByText("Administration Dashboard")).toBeInTheDocument();
  });
});
