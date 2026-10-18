// MiUnidadPage composes the pilot hook and the auth permissions, so both are
// mocked: the hook test (use-mi-unidad.spec.ts) covers the API contract, and
// these tests cover only the pilot-facing states and permission gating.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { MiUnidadPage } from "../../features/fleet/components/mi-unidad/mi-unidad-page";
import { useMiUnidad } from "../../features/fleet/hooks/use-mi-unidad";
import { usePasajerosUnidad } from "../../features/fleet/hooks/use-pasajeros-unidad";
import { useAuth } from "../../features/authentication/auth-context";
import { EstadoUnidad, type LineaParadaStop, type Unidad } from "../../features/fleet/types/fleet.types";
import type { User } from "../../features/authentication/auth-context";

vi.mock("../../features/fleet/hooks/use-mi-unidad", () => ({ useMiUnidad: vi.fn() }));
vi.mock("../../features/fleet/hooks/use-pasajeros-unidad", () => ({ usePasajerosUnidad: vi.fn() }));
vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});

const mockedUseMiUnidad = useMiUnidad as unknown as Mock;
const mockedUsePasajeros = usePasajerosUnidad as unknown as Mock;
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
  mockedUsePasajeros.mockReturnValue({
    occupancy: { idUnidad: "7", numeroPlaca: "P-777AAA", capacidadPasajeros: 120, aBordo: 6, porcentaje: 5, ultimoReporte: null },
    loading: false,
    error: null,
    refresh: vi.fn(),
    report: vi.fn(),
  });
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
    expect(screen.getByTestId("current-stop")).toHaveTextContent("Centro");
    expect(screen.getByText(/^Reportada el /)).toBeInTheDocument();
  });

  it("reports 'Sin reporte' when the unit has no current stop", () => {
    mockedUseMiUnidad.mockReturnValue(hookState({ unit: unit({ idLineaParadaActual: null }) }));
    renderPage();
    expect(screen.getByTestId("current-stop")).toHaveTextContent("Sin reporte");
  });

  it("resolves the current stop name from the stops list when the unit lacks it", () => {
    mockedUseMiUnidad.mockReturnValue(
      hookState({ unit: unit({ idLineaParadaActual: "101", nombreParadaActual: undefined }) }),
    );
    renderPage();
    expect(screen.getByTestId("current-stop")).toHaveTextContent("Terminal");
  });

  it("falls back to identifiers when the line and stop names are absent", () => {
    mockedUseMiUnidad.mockReturnValue(
      hookState({
        unit: unit({ nombreLinea: undefined, idLineaParadaActual: "102", nombreParadaActual: undefined }),
        stops: [],
      }),
    );
    renderPage();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByTestId("current-stop")).toHaveTextContent("102");
  });

  it("renders an empty state (not an error) when the pilot has no unit", () => {
    mockedUseMiUnidad.mockReturnValue(hookState({ unit: null, noUnit: true }));
    renderPage();
    expect(screen.getByText("No tiene una unidad asignada.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reportar en / })).not.toBeInTheDocument();
  });

  it("explains that a unit without a line cannot report, and hides the action", () => {
    mockedUseMiUnidad.mockReturnValue(
      hookState({ unit: unit({ idLinea: null, nombreLinea: undefined }), stops: [] }),
    );
    renderPage();
    expect(screen.getByText("Sin línea asignada")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("La unidad no tiene una línea asignada");
    expect(screen.queryByRole("button", { name: /^Reportar en / })).not.toBeInTheDocument();
  });

  // bus-passenger-report S8: the passengers panel sits with the stop buttons.
  it("shows the passengers panel for a pilot whose unit has a line, enabled at a current stop", () => {
    mockedUseMiUnidad.mockReturnValue(hookState({ unit: unit({ idLineaParadaActual: "102", nombreParadaActual: "Centro" }) }));
    renderPage();

    expect(screen.getByRole("region", { name: "Pasajeros en esta parada" })).toBeInTheDocument();
    expect(screen.getByTestId("a-bordo")).toHaveTextContent("A bordo: 6 de 120");
    expect(screen.getByRole("button", { name: "Registrar pasajeros" })).toBeEnabled();
  });

  it("reloads the stops (people waiting) after registering passengers", async () => {
    const refreshStops = vi.fn();
    const report = vi.fn().mockResolvedValue({
      idParadaUnidad: "9", idParada: "p2", nombreParada: "Centro", bajaron: 0, subieron: 2,
      aBordo: 8, porcentaje: 7, minutosEsperaExtra: 5, fecha: "2026-10-16T10:00:00.000Z",
    });
    mockedUseMiUnidad.mockReturnValue(
      hookState({ unit: unit({ idLineaParadaActual: "102", nombreParadaActual: "Centro" }), refreshStops }),
    );
    mockedUsePasajeros.mockReturnValue({
      occupancy: { idUnidad: "7", numeroPlaca: "P-777AAA", capacidadPasajeros: 120, aBordo: 6, porcentaje: 5, ultimoReporte: null },
      loading: false,
      error: null,
      refresh: vi.fn(),
      report,
    });
    renderPage();

    fireEvent.change(screen.getByLabelText("Subieron"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar pasajeros" }));

    await waitFor(() => expect(report).toHaveBeenCalledWith({ bajaron: 0, subieron: 2 }));
    await waitFor(() => expect(refreshStops).toHaveBeenCalledTimes(1));
  });

  it("disables the passengers report when the unit has no current stop", () => {
    mockedUseMiUnidad.mockReturnValue(hookState({ unit: unit({ idLineaParadaActual: null }) }));
    renderPage();

    expect(screen.getByRole("button", { name: "Registrar pasajeros" })).toBeDisabled();
  });

  it("hides the passengers panel without METRICAS_UNIDAD_REPORTAR", () => {
    mockedUseAuth.mockReturnValue({
      user: user(["UNIDAD_ASIGNADA_CONSULTAR"]),
      token: "fake-jwt",
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();

    expect(screen.queryByRole("region", { name: "Pasajeros en esta parada" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: /^Reportar en / })).not.toBeInTheDocument();
  });

  it("reports the location with one tap on a stop button, without a dialog", async () => {
    const reportLocation = vi.fn().mockResolvedValue({});
    mockedUseMiUnidad.mockReturnValue(hookState({ reportLocation }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Reportar en Terminal" }));

    await waitFor(() => expect(reportLocation).toHaveBeenCalledWith("101"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Ubicación actualizada: Terminal")).toBeInTheDocument();
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
