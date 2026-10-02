// OperatorOnlyRoute only reads permissions from useAuth(); useAuth is mocked so
// each permission case is deterministic (the same reason as
// protected-route.spec.tsx).

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { OperatorOnlyRoute } from "../../features/fleet/operator-only-route";
import { useAuth } from "../../features/authentication/auth-context";
import type { User } from "../../features/authentication/auth-context";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseAuth = useAuth as unknown as Mock;

function user(permissions: string[]): User {
  return {
    email: "user@transmetro.gt",
    employeeId: "emp-1",
    roles: ["PILOTO"],
    permissions,
    scope: { role: "PILOTO", modules: ["fleet"] },
  };
}

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={["/fleet"]}>
      <Routes>
        <Route
          path="/fleet"
          element={
            <OperatorOnlyRoute>
              <div>Fleet operator view</div>
            </OperatorOnlyRoute>
          }
        />
        <Route path="/fleet/my-unit" element={<div>Mi unidad</div>} />
        <Route path="/landing" element={<div>Landing Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    user: user(["FLOTA_GESTIONAR"]),
    token: "fake-jwt",
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
});

describe("OperatorOnlyRoute", () => {
  it("renders the operator view for a user with FLOTA_GESTIONAR", () => {
    renderRoute();
    expect(screen.getByText("Fleet operator view")).toBeInTheDocument();
  });

  it("redirects a pilot without FLOTA_GESTIONAR to /fleet/my-unit", () => {
    mockedUseAuth.mockReturnValue({
      user: user(["UNIDAD_ASIGNADA_CONSULTAR", "METRICAS_UNIDAD_REPORTAR"]),
      token: "fake-jwt",
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderRoute();

    expect(screen.getByText("Mi unidad")).toBeInTheDocument();
    expect(screen.queryByText("Fleet operator view")).not.toBeInTheDocument();
  });

  it("redirects a null user to /fleet/my-unit (defensive default)", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    renderRoute();

    expect(screen.getByText("Mi unidad")).toBeInTheDocument();
  });
});
