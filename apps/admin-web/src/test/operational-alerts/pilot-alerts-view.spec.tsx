// The hook is mocked: use-pilot-alerts.spec.ts covers the API contract and
// polling; these tests cover only what the pilot sees and does.

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("../../features/operational-alerts/hooks/use-pilot-alerts", () => ({
  usePilotAlerts: vi.fn(),
}));

import { usePilotAlerts } from "../../features/operational-alerts/hooks/use-pilot-alerts";
import { PilotAlertsView } from "../../features/operational-alerts/components/pilot-alerts-view";
import type { Alerta, AlertaDestinations } from "../../features/operational-alerts/types";

const mockedHook = usePilotAlerts as unknown as Mock;

const DESTINATIONS: AlertaDestinations = {
  unidad: { idUnidad: "7", numeroPlaca: "P-123ABC" },
  linea: { idLinea: "3", numeroLinea: "12", nombreLinea: "Línea 12" },
  destinations: [
    { idEstacion: "21", nombreEstacion: "Estación Norte", orden: 1, suggested: false },
    { idEstacion: "22", nombreEstacion: "Estación Centro", orden: 3, suggested: true },
  ],
};

const ALERT: Alerta = {
  idAlerta: "100",
  tipoAlerta: "FALLA_MECANICA",
  tipoOrigen: "UNIDAD",
  tipoDestino: "ESTACION",
  estadoAlerta: "EN_ATENCION",
  fechaCreacion: "2026-10-13T10:00:00.000Z",
  fechaActualizacion: "2026-10-13T10:05:00.000Z",
  unidad: { idUnidad: "7", numeroPlaca: "P-123ABC" },
  estacionDestino: { idEstacion: "22", nombreEstacion: "Estación Centro" },
  autor: { idEmpleado: "5", nombre: "Piloto Uno" },
  observaciones: [],
    linea: null,
};

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    destinations: DESTINATIONS,
    noUnit: false,
    noLine: false,
    loading: false,
    error: null,
    refresh: vi.fn(),
    sent: [],
    sentError: null,
    sendAlert: vi.fn(),
    ...overrides,
  };
}

const TYPE_LABELS = [
  "Accidente",
  "Falla mecánica",
  "Emergencia médica",
  "Incidente de seguridad",
  "Retraso",
  "Unidad llena",
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PilotAlertsView", () => {
  it("shows the unit, the line, one button per catalog type and preselects the suggested station", () => {
    mockedHook.mockReturnValue(hookState());

    render(<PilotAlertsView />);

    expect(screen.getByText("Unidad P-123ABC · Línea 12")).toBeInTheDocument();
    for (const label of TYPE_LABELS) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Estación de destino")).toHaveValue("22");
  });

  it("asks for confirmation and sends the chosen type to the chosen station", async () => {
    const sendAlert = vi.fn().mockResolvedValue({ ...ALERT, estacionDestino: { idEstacion: "21", nombreEstacion: "Estación Norte" } });
    mockedHook.mockReturnValue(hookState({ sendAlert }));
    render(<PilotAlertsView />);

    fireEvent.change(screen.getByLabelText("Estación de destino"), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Accidente" }));

    const dialog = screen.getByRole("dialog", { name: "Confirmar alerta" });
    expect(within(dialog).getByText("¿Enviar la alerta \"Accidente\" a Estación Norte?")).toBeInTheDocument();
    expect(sendAlert).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Enviar alerta" }));

    await waitFor(() => expect(sendAlert).toHaveBeenCalledWith("ACCIDENTE", "21"));
    expect(await screen.findByRole("status")).toHaveTextContent("Alerta enviada a Estación Norte.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelling the confirmation sends nothing", () => {
    const sendAlert = vi.fn();
    mockedHook.mockReturnValue(hookState({ sendAlert }));
    render(<PilotAlertsView />);

    fireEvent.click(screen.getByRole("button", { name: "Retraso" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("shows the backend message when sending fails and keeps the dialog open", async () => {
    const sendAlert = vi.fn().mockRejectedValue(new Error("La estación de destino no pertenece a la línea de la unidad"));
    mockedHook.mockReturnValue(hookState({ sendAlert }));
    render(<PilotAlertsView />);

    fireEvent.click(screen.getByRole("button", { name: "Accidente" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar alerta" }));

    const dialog = screen.getByRole("dialog", { name: "Confirmar alerta" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "La estación de destino no pertenece a la línea de la unidad",
    );
  });

  it("disables the confirm button while the alert is being sent", async () => {
    let resolve: (value: Alerta) => void = () => {};
    const sendAlert = vi.fn().mockReturnValue(new Promise<Alerta>((r) => (resolve = r)));
    mockedHook.mockReturnValue(hookState({ sendAlert }));
    render(<PilotAlertsView />);

    fireEvent.click(screen.getByRole("button", { name: "Accidente" }));
    fireEvent.click(screen.getByRole("button", { name: "Enviar alerta" }));

    expect(await screen.findByRole("button", { name: "Enviando..." })).toBeDisabled();
    resolve(ALERT);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lists the sent alerts with their state", () => {
    mockedHook.mockReturnValue(hookState({ sent: [ALERT] }));

    render(<PilotAlertsView />);

    const list = screen.getByRole("region", { name: "Mis alertas" });
    expect(within(list).getByText("Falla mecánica")).toBeInTheDocument();
    expect(within(list).getByText("Estación Centro")).toBeInTheDocument();
    expect(within(list).getByText("En atención")).toBeInTheDocument();
  });

  it("shows the pilot each sent alert's observations, oldest first, with author and state (S15)", () => {
    const withObs: Alerta = {
      ...ALERT,
      observaciones: [
        {
          estadoNuevo: "RECIBIDA",
          observacion: "Unidad en camino",
          fechaCambio: "2026-10-13T10:01:00.000Z",
          autor: { idEmpleado: "8", nombre: "Operador Uno" },
        },
        {
          estadoNuevo: "EN_ATENCION",
          observacion: "Central atiende",
          fechaCambio: "2026-10-13T10:05:00.000Z",
          autor: { idEmpleado: "1", nombre: "Central Uno" },
        },
      ],
    };
    mockedHook.mockReturnValue(hookState({ sent: [withObs, { ...ALERT, idAlerta: "101", tipoAlerta: "RETRASO" }] }));

    render(<PilotAlertsView />);

    const lists = within(screen.getByRole("region", { name: "Mis alertas" })).getAllByRole("list", {
      name: "Observaciones",
    });
    expect(lists).toHaveLength(1);
    const items = within(lists[0]!).getAllByRole("listitem");
    expect(items.map((i) => i.querySelector("p")?.textContent)).toEqual(["Unidad en camino", "Central atiende"]);
    expect(items[0]).toHaveTextContent(/Operador Uno · Recibida/);
    expect(items[1]).toHaveTextContent(/Central Uno · En atención/);
  });

  it("shows an empty sent list message", () => {
    mockedHook.mockReturnValue(hookState({ sent: [] }));

    render(<PilotAlertsView />);

    expect(screen.getByText("Todavía no ha enviado alertas.")).toBeInTheDocument();
  });

  it("explains that a pilot without unit cannot send alerts", () => {
    mockedHook.mockReturnValue(hookState({ destinations: null, noUnit: true }));

    render(<PilotAlertsView />);

    expect(screen.getByText("No tiene una unidad asignada.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accidente" })).not.toBeInTheDocument();
  });

  it("explains that a unit without line cannot send alerts", () => {
    mockedHook.mockReturnValue(hookState({ destinations: null, noLine: true }));

    render(<PilotAlertsView />);

    expect(screen.getByText("Su unidad no tiene una línea asignada.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accidente" })).not.toBeInTheDocument();
  });

  it("explains that a line without stations cannot receive alerts", () => {
    mockedHook.mockReturnValue(hookState({ destinations: { ...DESTINATIONS, destinations: [] } }));

    render(<PilotAlertsView />);

    expect(screen.getByText("La línea de su unidad no tiene estaciones para recibir alertas.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accidente" })).not.toBeInTheDocument();
  });

  it("shows a load error with a retry button", () => {
    const refresh = vi.fn();
    mockedHook.mockReturnValue(hookState({ destinations: null, error: "Error de conexión", refresh }));

    render(<PilotAlertsView />);

    expect(screen.getByRole("alert")).toHaveTextContent("Error de conexión");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
