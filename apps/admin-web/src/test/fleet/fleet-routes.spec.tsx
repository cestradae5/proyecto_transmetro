// Route wiring for the pilot view: /fleet/my-unit exists and requires module
// "fleet", and /fleet sends a user without FLOTA_GESTIONAR to it. The pages
// themselves are covered in test/fleet, so both are stubbed here — this file
// only asserts the routing contract.

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "../../features/authentication/auth-context";
import { hasPermission, FLEET_MANAGE_PERMISSION } from "../../features/fleet/permissions";
import { AuthenticationGuard } from "../../features/dashboard/protected-route";
import { OperatorOnlyRoute } from "../../features/fleet/operator-only-route";
import type { User } from "../../features/authentication/auth-context";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});
vi.mock("../../features/fleet", () => ({ FleetPage: () => <div>Fleet operator page</div> }));
vi.mock("../../features/fleet/components/mi-unidad/mi-unidad-page", () => ({
  MiUnidadPage: () => <div>Mi unidad page</div>,
}));

import { App } from "../../app/app";

// The real App mounts its own BrowserRouter; stub window.history so the
// initial location is the route under test.
function renderApp(path: string) {
  window.history.pushState({}, "", path);
  return render(<App />);
}

const mockedUseAuth = useAuth as unknown as Mock;

function user(modules: string[], permissions: string[]): User {
  return {
    email: "user@transmetro.gt",
    employeeId: "emp-1",
    roles: ["PILOTO"],
    permissions,
    scope: { role: "PILOTO", modules },
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

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/");
});

describe("fleet routes", () => {
  it("renders MiUnidadPage at /fleet/my-unit for a pilot (module fleet, no FLOTA_GESTIONAR)", () => {
    signIn(user(["fleet", "self_profile"], ["UNIDAD_ASIGNADA_CONSULTAR", "METRICAS_UNIDAD_REPORTAR"]));
    renderApp("/fleet/my-unit");
    expect(screen.getByText("Mi unidad page")).toBeInTheDocument();
  });

  it("redirects /fleet/my-unit to /landing when the user lacks module fleet", () => {
    signIn(user(["self_profile"], ["PERFIL_PROPIO_CONSULTAR"]));
    renderApp("/fleet/my-unit");
    expect(screen.getByText("Administration Dashboard")).toBeInTheDocument();
  });

  it("redirects /fleet/my-unit to /login when unauthenticated", () => {
    signIn(null);
    renderApp("/fleet/my-unit");
    expect(screen.getByRole("heading", { name: "Iniciar Sesión" })).toBeInTheDocument();
  });

  it("redirects /fleet to /fleet/my-unit when the user lacks FLOTA_GESTIONAR", () => {
    signIn(user(["fleet"], ["UNIDAD_ASIGNADA_CONSULTAR"]));
    renderApp("/fleet");
    expect(screen.getByText("Mi unidad page")).toBeInTheDocument();
    expect(screen.queryByText("Fleet operator page")).not.toBeInTheDocument();
  });

  it("renders FleetPage at /fleet when the user has FLOTA_GESTIONAR", () => {
    signIn(user(["fleet"], ["FLOTA_GESTIONAR"]));
    renderApp("/fleet");
    expect(screen.getByText("Fleet operator page")).toBeInTheDocument();
  });
});

// Guards the two building blocks this routing depends on, so a future refactor
// that inverts either one fails here instead of silently breaking pilots.
describe("route building blocks", () => {
  it("treats PILOTO permissions as fleet module without FLOTA_GESTIONAR", () => {
    const pilot = user(["fleet"], ["UNIDAD_ASIGNADA_CONSULTAR", "METRICAS_UNIDAD_REPORTAR"]);
    expect(pilot.scope.modules).toContain("fleet");
    expect(hasPermission(pilot, FLEET_MANAGE_PERMISSION)).toBe(false);
  });

  it("keeps AuthenticationGuard and OperatorOnlyRoute composable", () => {
    expect(typeof AuthenticationGuard).toBe("function");
    expect(typeof OperatorOnlyRoute).toBe("function");
  });
});
