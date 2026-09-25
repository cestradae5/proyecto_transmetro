// AuthenticationGuard reads useAuth() from auth-context. Its `loading` flag
// flips synchronously inside a useEffect that React Testing Library's
// render() already flushes before returning (real AuthProvider + seeded
// localStorage, as used in landing-page.spec.tsx, can never observe
// loading === true by the time assertions run). To deterministically cover
// the loading branch, useAuth is mocked directly instead.

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, type Mock } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthenticationGuard } from "../../features/dashboard/protected-route";
import { useAuth } from "../../features/authentication/auth-context";
import type { User } from "../../features/authentication/auth-context";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseAuth = useAuth as unknown as Mock;

function makeUser(modules: string[]): User {
  return {
    email: "user@transmetro.gt",
    employeeId: "emp-1",
    roles: ["OPERADOR_CENTRAL"],
    permissions: [],
    scope: { role: "OPERADOR_CENTRAL", modules },
  };
}

function renderGuard(requiredModule?: string) {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <AuthenticationGuard requiredModule={requiredModule}>
              <div>Protected Content</div>
            </AuthenticationGuard>
          }
        />
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/landing" element={<div>Landing Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthenticationGuard", () => {
  it("shows loading UI and neither renders children nor redirects while loading", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      loading: true,
      user: null,
      token: null,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderGuard();

    expect(screen.getByText("Cargando...")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login Page")).not.toBeInTheDocument();
    expect(screen.queryByText("Landing Page")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users to /login", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      loading: false,
      user: null,
      token: null,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderGuard();

    expect(screen.getByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("renders children for an authenticated user when no requiredModule is set", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: makeUser([]),
      token: "fake-jwt",
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderGuard();

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("renders children when requiredModule is present in user.scope.modules", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: makeUser(["infrastructure", "fleet"]),
      token: "fake-jwt",
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderGuard("infrastructure");

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("redirects to /landing when requiredModule is NOT present in user.scope.modules", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: makeUser(["fleet"]),
      token: "fake-jwt",
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderGuard("infrastructure");

    expect(screen.getByText("Landing Page")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("redirects to /landing when user.scope is missing entirely (defensive default)", () => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: { ...makeUser([]), scope: undefined as unknown as User["scope"] },
      token: "fake-jwt",
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderGuard("infrastructure");

    expect(screen.getByText("Landing Page")).toBeInTheDocument();
  });
});
