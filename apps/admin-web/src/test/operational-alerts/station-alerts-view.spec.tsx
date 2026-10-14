// The hook is mocked: use-station-alerts.spec.ts covers the API contract and
// polling; these tests cover what the station operator sees and does.

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("../../features/operational-alerts/hooks/use-station-alerts", () => ({
  useStationAlerts: vi.fn(),
}));

import { useStationAlerts } from "../../features/operational-alerts/hooks/use-station-alerts";
import { StationAlertsView } from "../../features/operational-alerts/components/station-alerts-view";
import type { Alerta, EstadoAlerta } from "../../features/operational-alerts/types";

const mockedHook = useStationAlerts as unknown as Mock;

function alert(id: string, estadoAlerta: EstadoAlerta, overrides: Partial<Alerta> = {}): Alerta {
  return {
    idAlerta: id,
    tipoAlerta: "ACCIDENTE",
    tipoOrigen: "UNIDAD",
    tipoDestino: "ESTACION",
    estadoAlerta,
    fechaCreacion: "2026-10-13T10:00:00.000Z",
    fechaActualizacion: "2026-10-13T10:00:00.000Z",
    unidad: { idUnidad: "7", numeroPlaca: `P-${id}` },
    estacionDestino: { idEstacion: "22", nombreEstacion: "Estación Centro" },
    autor: { idEmpleado: "5", nombre: "Piloto Uno" },
    observaciones: [],
    ...overrides,
  };
}

function hookState(alerts: Alerta[], overrides: Record<string, unknown> = {}) {
  return {
    data: { station: { idEstacion: "22", nombreEstacion: "Estación Centro" }, alerts },
    noStation: false,
    loading: false,
    error: null,
    refresh: vi.fn(),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const card = (plate: string) => screen.getByText(plate).closest("li") as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StationAlertsView", () => {
  it("shows the station and how many alerts are pending", () => {
    mockedHook.mockReturnValue(
      hookState([alert("1", "PENDIENTE"), alert("2", "PENDIENTE"), alert("3", "RECIBIDA"), alert("4", "RESUELTA")]),
    );

    render(<StationAlertsView />);

    expect(screen.getByText("Estación Centro")).toBeInTheDocument();
    expect(screen.getByText("2 pendientes")).toBeInTheDocument();
  });

  it("separates active alerts from resolved ones and shows each alert's data", () => {
    mockedHook.mockReturnValue(
      hookState([
        alert("1", "PENDIENTE", { tipoAlerta: "FALLA_MECANICA" }),
        alert("2", "RESUELTA", { tipoAlerta: "RETRASO" }),
      ]),
    );

    render(<StationAlertsView />);

    const active = screen.getByRole("region", { name: "Alertas activas" });
    expect(within(active).getByText("Falla mecánica")).toBeInTheDocument();
    expect(within(active).getByText("P-1")).toBeInTheDocument();
    expect(within(active).getByText(/Piloto Uno/)).toBeInTheDocument();
    expect(within(active).getByText("Pendiente")).toBeInTheDocument();
    expect(within(active).queryByText("P-2")).not.toBeInTheDocument();

    const resolved = screen.getByRole("region", { name: "Resueltas" });
    expect(within(resolved).getByText("Retraso")).toBeInTheDocument();
    expect(within(resolved).getByText("P-2")).toBeInTheDocument();
  });

  it.each([
    ["PENDIENTE", ["Marcar recibida", "En atención", "Resolver"]],
    ["RECIBIDA", ["En atención", "Resolver"]],
    ["EN_ATENCION", ["Resolver"]],
  ] as const)("offers only forward actions for a %s alert", (estado, labels) => {
    mockedHook.mockReturnValue(hookState([alert("1", estado)]));

    render(<StationAlertsView />);

    const actions = within(card("P-1")).getAllByRole("button").map((b) => b.textContent);
    expect(actions).toEqual(labels);
  });

  it("offers no actions for resolved alerts", () => {
    mockedHook.mockReturnValue(hookState([alert("1", "RESUELTA")]));

    render(<StationAlertsView />);

    expect(within(card("P-1")).queryAllByRole("button")).toEqual([]);
    expect(within(card("P-1")).queryByLabelText(/Observación/)).not.toBeInTheDocument();
  });

  it("moves an alert forward with the typed observation", async () => {
    const state = hookState([alert("1", "PENDIENTE")]);
    mockedHook.mockReturnValue(state);
    render(<StationAlertsView />);

    fireEvent.change(within(card("P-1")).getByLabelText("Observación (opcional)"), {
      target: { value: "Unidad en camino" },
    });
    fireEvent.click(within(card("P-1")).getByRole("button", { name: "Marcar recibida" }));

    await waitFor(() => expect(state.updateStatus).toHaveBeenCalledWith("1", "RECIBIDA", "Unidad en camino"));
  });

  it("shows the alert's previous observations to the station operator (S15)", () => {
    mockedHook.mockReturnValue(
      hookState([
        alert("1", "RECIBIDA", {
          observaciones: [
            {
              estadoNuevo: "RECIBIDA",
              observacion: "Unidad en camino",
              fechaCambio: "2026-10-13T10:01:00.000Z",
              autor: { idEmpleado: "8", nombre: "Operador Uno" },
            },
          ],
        }),
        alert("2", "PENDIENTE"),
      ]),
    );

    render(<StationAlertsView />);

    const list = within(card("P-1")).getByRole("list", { name: "Observaciones" });
    expect(within(list).getByRole("listitem")).toHaveTextContent(/Unidad en camino.*Operador Uno · Recibida/);
    expect(within(card("P-2")).queryByRole("list", { name: "Observaciones" })).not.toBeInTheDocument();
  });

  it("limits the observation to 500 characters", () => {
    mockedHook.mockReturnValue(hookState([alert("1", "PENDIENTE")]));
    render(<StationAlertsView />);

    expect(within(card("P-1")).getByLabelText("Observación (opcional)")).toHaveAttribute("maxLength", "500");
  });

  it("disables the alert's actions while its update is pending", async () => {
    let resolve: () => void = () => {};
    const updateStatus = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));
    mockedHook.mockReturnValue(hookState([alert("1", "PENDIENTE"), alert("2", "PENDIENTE")], { updateStatus }));
    render(<StationAlertsView />);

    fireEvent.click(within(card("P-1")).getByRole("button", { name: "Resolver" }));

    await waitFor(() => {
      for (const button of within(card("P-1")).getAllByRole("button")) expect(button).toBeDisabled();
    });
    for (const button of within(card("P-2")).getAllByRole("button")) expect(button).toBeEnabled();
    resolve();
    await waitFor(() => expect(within(card("P-1")).getByRole("button", { name: "Resolver" })).toBeEnabled());
  });

  it("shows the backend message on the alert when the update fails", async () => {
    const updateStatus = vi
      .fn()
      .mockRejectedValue(new Error("La alerta ya cambió de estado. Actualice la lista e intente de nuevo"));
    mockedHook.mockReturnValue(hookState([alert("1", "PENDIENTE")], { updateStatus }));
    render(<StationAlertsView />);

    fireEvent.click(within(card("P-1")).getByRole("button", { name: "Resolver" }));

    expect(await within(card("P-1")).findByRole("alert")).toHaveTextContent(
      "La alerta ya cambió de estado. Actualice la lista e intente de nuevo",
    );
  });

  it("shows an empty message when the station has no active alerts", () => {
    mockedHook.mockReturnValue(hookState([]));

    render(<StationAlertsView />);

    expect(screen.getByText("0 pendientes")).toBeInTheDocument();
    expect(screen.getByText("No hay alertas activas para su estación.")).toBeInTheDocument();
  });

  it("explains that an operator without station receives no alerts", () => {
    mockedHook.mockReturnValue({ ...hookState([]), data: null, noStation: true });

    render(<StationAlertsView />);

    expect(screen.getByText("No tiene una estación asignada.")).toBeInTheDocument();
  });

  it("shows a load error with a retry button", () => {
    const refresh = vi.fn();
    mockedHook.mockReturnValue({ ...hookState([]), data: null, error: "Error de conexión", refresh });

    render(<StationAlertsView />);

    expect(screen.getByRole("alert")).toHaveTextContent("Error de conexión");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
