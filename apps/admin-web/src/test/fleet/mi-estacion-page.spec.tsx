// MiEstacionPage composes useMiEstacion, which is mocked: use-mi-estacion.spec.ts
// covers the API contract, these tests cover the operator-facing states.

import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { MiEstacionPage } from "../../features/fleet/components/mi-estacion/mi-estacion-page";
import { useMiEstacion } from "../../features/fleet/hooks/use-mi-estacion";
import type { MiEstacion } from "../../features/fleet/types/fleet.types";

vi.mock("../../features/fleet/hooks/use-mi-estacion", () => ({ useMiEstacion: vi.fn() }));

const mockedUseMiEstacion = useMiEstacion as unknown as Mock;

const STATION: MiEstacion = {
  station: {
    idEstacion: "1",
    nombreEstacion: "Estación Central",
    estadoEstacion: "ACTIVA",
    latitud: 14.6,
    longitud: -90.5,
    parada: { idParada: "p2", nombreParada: "Parada Centro" },
  },
  lines: [
    {
      idLinea: "4",
      numeroLinea: "12",
      nombreLinea: "Línea 12",
      colorHex: "#ff0000",
      estadoLinea: "ACTIVA",
      tipoPunto: "CONTROL",
      stops: [
        { idLineaParada: "102", orden: 2, idParada: "p2", nombreParada: "Parada Centro", isStationStop: true },
        { idLineaParada: "101", orden: 1, idParada: "p1", nombreParada: "Terminal", isStationStop: false },
      ],
    },
  ],
  units: [
    {
      idUnidad: "7",
      numeroPlaca: "P-777AAA",
      estadoUnidad: "EN_SERVICIO",
      idLinea: "4",
      idLineaParadaActual: "101",
      nombreParadaActual: "Terminal",
      fechaReporteUbicacion: "2026-01-02T10:00:00Z",
      pilotAssigned: true,
    },
    { idUnidad: "8", numeroPlaca: "P-888BBB", estadoUnidad: "DISPONIBLE", idLinea: "4", pilotAssigned: false },
  ],
};

function hookState(overrides: Record<string, unknown> = {}) {
  return { data: STATION, noStation: false, loading: false, error: null, refresh: vi.fn(), ...overrides };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fleet/my-station"]}>
      <Routes>
        <Route path="/fleet/my-station" element={<MiEstacionPage />} />
        <Route path="/landing" element={<div>Landing Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseMiEstacion.mockReturnValue(hookState());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MiEstacionPage", () => {
  it("shows the loading state while fetching", () => {
    mockedUseMiEstacion.mockReturnValue(hookState({ data: null, loading: true }));
    renderPage();
    expect(screen.getByText("Cargando...")).toBeInTheDocument();
  });

  it("renders the station, its lines with the station stop highlighted, and the units", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Estación Central" })).toBeInTheDocument();
    expect(screen.getByText("14.6, -90.5")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "12 - Línea 12" })).toBeInTheDocument();
    expect(screen.getByText("CONTROL")).toBeInTheDocument();
    expect(screen.getByTestId("line-color-4")).toHaveStyle({ backgroundColor: "#ff0000" });

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["1. Terminal", "2. Parada CentroEsta estación"]);
    expect(items[1]).toHaveAttribute("data-station-stop", "true");
    expect(items[0]).toHaveAttribute("data-station-stop", "false");

    const rows = screen.getAllByRole("row");
    const first = within(rows[1]!);
    expect(first.getByText("P-777AAA")).toBeInTheDocument();
    expect(first.getByText("En servicio")).toBeInTheDocument();
    expect(first.getByText("Terminal")).toBeInTheDocument();
    expect(first.getByText("Sí")).toBeInTheDocument();
    const second = within(rows[2]!);
    expect(second.getByText("Sin reporte")).toBeInTheDocument();
    expect(second.getByText("No")).toBeInTheDocument();
  });

  it("shows the empty state when the operator has no station assigned", () => {
    mockedUseMiEstacion.mockReturnValue(hookState({ data: null, noStation: true }));
    renderPage();
    expect(screen.getByText("No tiene una estación asignada.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the error with a retry button that refreshes", () => {
    const refresh = vi.fn();
    mockedUseMiEstacion.mockReturnValue(hookState({ data: null, error: "Fallo de red", refresh }));
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Fallo de red");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes on 'Actualizar' and navigates back to the landing page", () => {
    const refresh = vi.fn();
    mockedUseMiEstacion.mockReturnValue(hookState({ refresh }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(refresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByText("Landing Page")).toBeInTheDocument();
  });

  it("polls every 30s and stops polling on unmount", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    mockedUseMiEstacion.mockReturnValue(hookState({ refresh }));
    const { unmount } = renderPage();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
