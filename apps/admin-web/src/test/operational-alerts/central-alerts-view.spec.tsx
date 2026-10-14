// The hook is mocked: use-central-alerts.spec.ts covers the API contract and
// polling; these tests cover the grouped view admins and central operators get.

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("../../features/operational-alerts/hooks/use-central-alerts", () => ({
  useCentralAlerts: vi.fn(),
}));

import { useCentralAlerts } from "../../features/operational-alerts/hooks/use-central-alerts";
import { CentralAlertsView } from "../../features/operational-alerts/components/central-alerts-view";
import type { Alerta, CentralAlerts, EstadoAlerta } from "../../features/operational-alerts/types";

const mockedHook = useCentralAlerts as unknown as Mock;

function alert(id: string, estadoAlerta: EstadoAlerta, overrides: Partial<Alerta> = {}): Alerta {
  return {
    idAlerta: id,
    tipoAlerta: "ACCIDENTE",
    tipoOrigen: "UNIDAD",
    tipoDestino: "ESTACION",
    estadoAlerta,
    fechaCreacion: "2026-10-13T10:00:00.000Z",
    fechaActualizacion: "2026-10-13T10:00:00.000Z",
    unidad: { idUnidad: "7", numeroPlaca: "P-123ABC" },
    estacionDestino: { idEstacion: "22", nombreEstacion: "Estación Centro" },
    autor: { idEmpleado: "5", nombre: "Piloto Uno" },
    observaciones: [],
    ...overrides,
  };
}

const DATA: CentralAlerts = {
  lineas: [
    {
      idLinea: "1",
      numeroLinea: "1",
      nombreLinea: "Centro Histórico",
      estaciones: [
        {
          idEstacion: "20",
          nombreEstacion: "Estación Norte",
          unidades: [
            { idUnidad: "3", numeroPlaca: "P-300CCC", alerts: [alert("1", "PENDIENTE", { tipoAlerta: "FALLA_MECANICA" })] },
            { idUnidad: "4", numeroPlaca: "P-400DDD", alerts: [alert("2", "RECIBIDA"), alert("3", "PENDIENTE")] },
          ],
        },
        {
          idEstacion: "21",
          nombreEstacion: "Estación Sur",
          unidades: [{ idUnidad: "5", numeroPlaca: "P-500EEE", alerts: [alert("4", "RESUELTA", { tipoAlerta: "RETRASO" })] }],
        },
      ],
    },
    {
      idLinea: null,
      numeroLinea: null,
      nombreLinea: "Sin línea",
      estaciones: [
        {
          idEstacion: "30",
          nombreEstacion: "Estación Oeste",
          unidades: [{ idUnidad: "8", numeroPlaca: "P-800HHH", alerts: [alert("5", "EN_ATENCION")] }],
        },
      ],
    },
  ],
};

function hookState(data: CentralAlerts | null, overrides: Record<string, unknown> = {}) {
  return {
    data,
    loading: false,
    error: null,
    refresh: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const line = (name: string) => screen.getByRole("region", { name });
const station = (name: string) => screen.getByRole("region", { name });
const unit = (plate: string) => screen.getByRole("group", { name: `Unidad ${plate}` });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CentralAlertsView", () => {
  it("shows the total pending count of every station", () => {
    mockedHook.mockReturnValue(hookState(DATA));

    render(<CentralAlertsView />);

    expect(screen.getByRole("heading", { name: "Todas las estaciones" })).toBeInTheDocument();
    expect(screen.getByTestId("central-pending-count")).toHaveTextContent("2 pendientes");
  });

  it("groups alerts by line, then station, then unit", () => {
    mockedHook.mockReturnValue(hookState(DATA));

    render(<CentralAlertsView />);

    const lines = screen.getAllByRole("region").filter((r) => r.dataset.level === "line");
    expect(lines.map((r) => r.getAttribute("aria-label"))).toEqual(["Línea 1 · Centro Histórico", "Sin línea"]);

    const first = line("Línea 1 · Centro Histórico");
    const stations = within(first).getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(stations).toEqual(["Estación Norte", "Estación Sur"]);

    const norte = station("Estación Norte");
    const units = within(norte).getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(units).toEqual(["Unidad P-300CCC", "Unidad P-400DDD"]);

    expect(within(unit("P-300CCC")).getByText("Falla mecánica")).toBeInTheDocument();
    expect(within(unit("P-400DDD")).getAllByRole("listitem")).toHaveLength(2);
    expect(within(line("Sin línea")).getByRole("region", { name: "Estación Oeste" })).toBeInTheDocument();
  });

  it("shows each station's pending count", () => {
    mockedHook.mockReturnValue(hookState(DATA));

    render(<CentralAlertsView />);

    expect(within(station("Estación Norte")).getByText("2 pendientes")).toBeInTheDocument();
    expect(within(station("Estación Sur")).getByText("0 pendientes")).toBeInTheDocument();
  });

  it("offers forward actions and none for resolved alerts", () => {
    mockedHook.mockReturnValue(hookState(DATA));

    render(<CentralAlertsView />);

    const pending = within(unit("P-300CCC")).getAllByRole("button").map((b) => b.textContent);
    expect(pending).toEqual(["Marcar recibida", "En atención", "Resolver"]);
    expect(within(unit("P-500EEE")).queryAllByRole("button")).toEqual([]);
  });

  it("moves any station's alert forward with the typed observation", async () => {
    const state = hookState(DATA);
    mockedHook.mockReturnValue(state);
    render(<CentralAlertsView />);

    fireEvent.change(within(unit("P-800HHH")).getByLabelText("Observación (opcional)"), {
      target: { value: "Central resolvió" },
    });
    fireEvent.click(within(unit("P-800HHH")).getByRole("button", { name: "Resolver" }));

    await waitFor(() => expect(state.updateStatus).toHaveBeenCalledWith("5", "RESUELTA", "Central resolvió"));
  });

  it("shows the backend message on the alert when the update fails", async () => {
    const updateStatus = vi
      .fn()
      .mockRejectedValue(new Error("La alerta ya cambió de estado. Actualice la lista e intente de nuevo"));
    mockedHook.mockReturnValue(hookState(DATA, { updateStatus }));
    render(<CentralAlertsView />);

    fireEvent.click(within(unit("P-300CCC")).getByRole("button", { name: "Resolver" }));

    expect(await within(unit("P-300CCC")).findByRole("alert")).toHaveTextContent(
      "La alerta ya cambió de estado. Actualice la lista e intente de nuevo",
    );
  });

  it("shows the alert's observations to central users (S15)", () => {
    const data: CentralAlerts = {
      lineas: [
        {
          ...DATA.lineas[0]!,
          estaciones: [
            {
              idEstacion: "20",
              nombreEstacion: "Estación Norte",
              unidades: [
                {
                  idUnidad: "3",
                  numeroPlaca: "P-300CCC",
                  alerts: [
                    alert("1", "EN_ATENCION", {
                      observaciones: [
                        {
                          estadoNuevo: "EN_ATENCION",
                          observacion: "Central atiende",
                          fechaCambio: "2026-10-13T10:05:00.000Z",
                          autor: { idEmpleado: "1", nombre: "Central Uno" },
                        },
                      ],
                    }),
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    mockedHook.mockReturnValue(hookState(data));

    render(<CentralAlertsView />);

    const list = within(unit("P-300CCC")).getByRole("list", { name: "Observaciones" });
    expect(within(list).getByRole("listitem")).toHaveTextContent(/Central atiende.*Central Uno · En atención/);
  });

  it("shows an empty message when there are no alerts", () => {
    mockedHook.mockReturnValue(hookState({ lineas: [] }));

    render(<CentralAlertsView />);

    expect(screen.getByTestId("central-pending-count")).toHaveTextContent("0 pendientes");
    expect(screen.getByText("No hay alertas registradas.")).toBeInTheDocument();
  });

  it("shows a load error with a retry button", () => {
    const refresh = vi.fn();
    mockedHook.mockReturnValue(hookState(null, { error: "Error de conexión", refresh }));

    render(<CentralAlertsView />);

    expect(screen.getByRole("alert")).toHaveTextContent("Error de conexión");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
