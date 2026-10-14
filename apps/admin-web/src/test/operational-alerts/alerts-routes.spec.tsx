// Route wiring and role routing of /alerts (S10). The two views are stubbed:
// their own specs cover them; this file only asserts which one each role gets.

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
vi.mock("../../features/operational-alerts/components/pilot-alerts-view", () => ({
  PilotAlertsView: () => <div>Pilot alerts view</div>,
}));
vi.mock("../../features/operational-alerts/components/station-alerts-view", () => ({
  StationAlertsView: () => <div>Station alerts view</div>,
}));

import { App } from "../../app/app";

const mockedUseAuth = useAuth as unknown as Mock;

function signIn(modules: string[] | null, permissions: string[] = []) {
  const user: User | null =
    modules === null
      ? null
      : {
          email: "user@transmetro.gt",
          employeeId: "emp-1",
          roles: ["X"],
          permissions,
          scope: { role: "X", modules },
        };
  mockedUseAuth.mockReturnValue({
    user,
    token: "fake-jwt",
    isAuthenticated: user !== null,
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

describe("/alerts routes", () => {
  it("shows the pilot view to a user with ALERTAS_UNIDAD_GESTIONAR", () => {
    signIn(["operational_alerts"], ["ALERTAS_UNIDAD_GESTIONAR"]);
    renderApp("/alerts");
    expect(screen.getByRole("heading", { name: "Alertas operativas" })).toBeInTheDocument();
    expect(screen.getByText("Pilot alerts view")).toBeInTheDocument();
    expect(screen.queryByText("Station alerts view")).not.toBeInTheDocument();
  });

  it("shows the station view to a user with ALERTAS_ESTACION_GESTIONAR", () => {
    signIn(["operational_alerts"], ["ALERTAS_ESTACION_GESTIONAR"]);
    renderApp("/alerts");
    expect(screen.getByText("Station alerts view")).toBeInTheDocument();
    expect(screen.queryByText("Pilot alerts view")).not.toBeInTheDocument();
  });

  it("tells any other role with the module that there is no view for it yet", () => {
    signIn(["operational_alerts"], ["ALERTAS_OPERATIVAS_GESTIONAR"]);
    renderApp("/alerts");
    expect(
      screen.getByText("Su rol no tiene una vista de alertas operativas en esta versión."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pilot alerts view")).not.toBeInTheDocument();
  });

  it("redirects to /landing without the operational_alerts module", () => {
    signIn(["self_profile"], ["ALERTAS_UNIDAD_GESTIONAR"]);
    renderApp("/alerts");
    expect(screen.getByText("Administration Dashboard")).toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated", () => {
    signIn(null);
    renderApp("/alerts");
    expect(screen.getByRole("heading", { name: "Iniciar Sesión" })).toBeInTheDocument();
  });
});
