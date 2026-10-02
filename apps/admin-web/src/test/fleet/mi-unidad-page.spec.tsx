// MiUnidadPage composes the pilot hook and the auth permissions, so both are
// mocked: the hook test (use-mi-unidad.spec.ts) covers the API contract, and
// these tests cover only the pilot-facing states and permission gating.

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { MiUnidadPage } from "../../features/fleet/components/mi-unidad/mi-unidad-page";
import { useMiUnidad } from "../../features/fleet/hooks/use-mi-unidad";
import { useAuth } from "../../features/authentication/auth-context";
import { EstadoUnidad, type LineaParadaStop, type Unidad } from "../../features/fleet/types/fleet.types";
import type { User } from "../../features/authentication/auth-context";

vi.mock("../../features/fleet/hooks/use-mi-unidad", () => ({ useMiUnidad: vi.fn() }));
vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseMiUnidad = useMiUnidad as unknown as Mock;
const mockedUseAuth = useAuth as unknown as Mock;

const PILOT_PERMISSIONS = ["PERFIL_PROPIO_CONSULTAR", "UNIDAD_ASIGNADA_CONSULTAR", "METRICAS_UNIDAD_REPORTAR"];

const STOPS: LineaParadaStop[] = [
  { idLineaParada: "102", idParada: "p2", nombre: "Centro", orden: 2 },
  { idLineaParada: "101", idParada: "p1", nombre: "Terminal", orden: 1 },
];

function unit(overrides: Partial<Unidad> = {}): Unidad {
  return {
    idUnidad: "7",
    numeroPlaca: "P-777AAA",
    marca: "Volvo",
    modelo: "B8R",
    anio: 2022,
    capacidadPasajeros: 120,
    estadoUnidad: EstadoUnidad.EN_SERVICIO,
    fechaRegistro: "2026-01-01",
    fechaActualizacion: "2026-01-01",
    idLinea: "4",
    nombreLinea: "Línea 12",
    ...overrides,
  };
}

function user(permissions: string[] = PILOT_PERMISSIONS): User {
  return {
    email: "piloto@transmetro.gt",
    employeeId: "emp-7",
    roles: ["PILOTO"],
    permissions,
    scope: { role: "PILOTO", modules: ["fleet", "operational_alerts", "self_profile"] },
  };
}

/** Full hook result; only the fields a test cares about need overriding. */
function hookState(overrides: Record<string, unknown> = {}) {
  return {
    unit: unit(),
    noUnit: false,
    loading: false,
    error: null,
    refresh: vi.fn(),
    stops: STOPS,
    stopsLoading: false,
    stopsError: null,
    refreshStops: vi.fn(),
    reportLocation: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fleet/my-unit"]}>
      <Routes>
        <Route path="/fleet/my-unit" element={<MiUnidadPage />} />
        <Route path="/landing" element={<div>Landing destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseAuth.mockReturnValue({
    user: user(),
    token: "fake-jwt",
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
  mockedUseMiUnidad.mockReturnValue(hookState());
});

describe("MiUnidadPage", () => {
  it("shows the unit card with its line, current stop and last report time", () => {
    mockedUseMiUnidad.mockReturnValue(
      hookState({
        unit: unit({
          idLineaParadaActual: "102",
          nombreParadaActual: "Centro",
          fechaReporteUbicacion: "2026-01-02T10:00:00.000Z",
        }),
      }),
    );
    renderPage();

    expect(screen.getByRole("heading", { name: "Unidad P-777AAA" })).toBeInTheDocument();
    expect(screen.getByText("Volvo B8R")).toBeInTheDocument();
    expect(screen.getByText("2022")).toBeInTheDocument();
    expect(screen.getByText("120 pasajeros")).toBeInTheDocument();
    expect(screen.getByText("En servicio")).toBeInTheDocument();
    expect(screen.getByText("Línea 12")).toBeInTheDocument();
    expect(screen.getByText("Centro")).toBeInTheDocument();
    expect(screen.getByText(/^Reportada el /)).toBeInTheDocument();
  });

  it("reports 'Sin reporte' when the unit has no current stop", () => {
    mockedUseMiUnidad.mockReturnValue(hookState({ unit: unit({ idLineaParadaActual: null }) }));
    renderPage();
    expect(screen.getByText("Sin reporte")).toBeInTheDocument();
  });

  it("falls back to identifiers when the line and stop names are absent", () => {
    mockedUseMiUnidad.mockReturnValue(
      hookState({
        unit: unit({ nombreLinea: undefined, idLineaParadaActual: "102", nombreParadaActual: undefined }),
      }),
    );
    renderPage();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("102")).toBeInTheDocument();
  });

  it("renders an empty state (not an error) when the pilot has no unit", () => {
    mockedUseMiUnidad.mockReturnValue(hookState({ unit: null, noUnit: true }));
    renderPage();
    expect(screen.getByText("No tiene una unidad asignada.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reportar ubicación" })).not.toBeInTheDocument();
  });

  it("explains that a unit without a line cannot report, and hides the action", () => {
    mockedUseMiUnidad.mockReturnValue(
      hookState({ unit: unit({ idLinea: null, nombreLinea: undefined }), stops: [] }),
    );
    renderPage();
    expect(screen.getByText("Sin línea asignada")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("La unidad no tiene una línea asignada");
    expect(screen.queryByRole("button", { name: "Reportar ubicación" })).not.toBeInTheDocument();
  });

  it("hides the report action without METRICAS_UNIDAD_REPORTAR", () => {
    mockedUseAuth.mockReturnValue({
      user: user(["UNIDAD_ASIGNADA_CONSULTAR"]),
      token: "fake-jwt",
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("Línea 12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reportar ubicación" })).not.toBeInTheDocument();
  });

  it("reports the location through the pilot dialog and closes it", async () => {
    const reportLocation = vi.fn().mockResolvedValue({});
    mockedUseMiUnidad.mockReturnValue(hookState({ reportLocation }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Reportar ubicación" }));
    const dialog = await screen.findByRole("dialog", { name: "Reportar ubicación" });
    fireEvent.change(within(dialog).getByLabelText("Parada"), { target: { value: "101" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Reportar ubicación" }));

    await waitFor(() => expect(reportLocation).toHaveBeenCalledWith("101"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a retryable error when the unit cannot be loaded", () => {
    const refresh = vi.fn();
    mockedUseMiUnidad.mockReturnValue(
      hookState({ unit: null, noUnit: false, error: "Error de conexión", refresh }),
    );
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Error de conexión");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("warns without dropping the card when a refresh fails", () => {
    mockedUseMiUnidad.mockReturnValue(hookState({ error: "Error de conexión" }));
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo actualizar la unidad: Error de conexión");
    expect(screen.getByRole("heading", { name: "Unidad P-777AAA" })).toBeInTheDocument();
  });

  it("navigates back to the landing page", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByText("Landing destination")).toBeInTheDocument();
  });
});
