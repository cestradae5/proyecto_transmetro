import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { EstacionLineasDialog } from "../../features/infrastructure/components/estacion-lineas/estacion-lineas-dialog";
import { useEstacionLineas } from "../../features/infrastructure/hooks/use-estacion-lineas";
import { useEstacionLineasDisponibles } from "../../features/infrastructure/hooks/use-estacion-lineas-disponibles";
import type { Linea } from "../../features/infrastructure/types/infrastructure.types";

vi.mock("../../features/infrastructure/hooks/use-estacion-lineas", () => ({ useEstacionLineas: vi.fn() }));
vi.mock("../../features/infrastructure/hooks/use-estacion-lineas-disponibles", () => ({
  useEstacionLineasDisponibles: vi.fn(),
}));

// Only l2 passes through the station (and is not linked yet); l3 does not.
const disponibles = {
  items: [{ idLinea: "l2", numeroLinea: "2", nombreLinea: "Azul" }],
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
};

const LINEAS = [
  { idLinea: "l1", numeroLinea: "1", nombreLinea: "Roja" },
  { idLinea: "l2", numeroLinea: "2", nombreLinea: "Azul" },
  { idLinea: "l3", numeroLinea: "3", nombreLinea: "Verde" },
] as Linea[];

const hook = {
  items: [{ idEstacion: "10", idLinea: "l1", tipoPunto: "PRINCIPAL", estadoAsignacion: "ACTIVA" }],
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
  addLine: vi.fn(),
  updateLine: vi.fn(),
  removeLine: vi.fn(),
};

function renderDialog() {
  const onClose = vi.fn();
  render(<EstacionLineasDialog stationId="10" stationName="Central" lineas={LINEAS} onClose={onClose} />);
  return onClose;
}

beforeEach(() => {
  hook.items = [{ idEstacion: "10", idLinea: "l1", tipoPunto: "PRINCIPAL", estadoAsignacion: "ACTIVA" }];
  hook.error = null;
  hook.addLine = vi.fn().mockResolvedValue(undefined);
  hook.updateLine = vi.fn().mockResolvedValue(undefined);
  hook.removeLine = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useEstacionLineas).mockReturnValue(hook as never);
  disponibles.items = [{ idLinea: "l2", numeroLinea: "2", nombreLinea: "Azul" }];
  disponibles.refresh = vi.fn();
  vi.mocked(useEstacionLineasDisponibles).mockReturnValue(disponibles as never);
});

afterEach(() => vi.restoreAllMocks());

describe("EstacionLineasDialog", () => {
  it("lists linked lines and offers only lines whose route stops at the station (S11)", () => {
    renderDialog();
    expect(vi.mocked(useEstacionLineasDisponibles)).toHaveBeenCalledWith("10");
    expect(screen.getByText("1 - Roja")).toBeInTheDocument();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("2 - Azul");
    expect(options).not.toContain("3 - Verde");
    expect(options).not.toContain("1 - Roja");
  });

  it("explains when no other line passes through the station", () => {
    disponibles.items = [];
    renderDialog();
    expect(screen.getByText("Ninguna otra línea pasa por la parada de esta estación.")).toBeInTheDocument();
  });

  it("refreshes the available lines after adding or removing one", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDialog();
    fireEvent.change(screen.getByLabelText("Línea"), { target: { value: "l2" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
    await waitFor(() => expect(disponibles.refresh).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(disponibles.refresh).toHaveBeenCalledTimes(2));
  });

  it("adds a line with the chosen tipoPunto", async () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Agregar línea" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Línea"), { target: { value: "l2" } });
    fireEvent.change(screen.getByLabelText("Tipo de punto"), { target: { value: "CONTROL" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
    await waitFor(() => expect(hook.addLine).toHaveBeenCalledWith({ idLinea: "l2", tipoPunto: "CONTROL" }));
  });

  it("updates tipoPunto and estado", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Tipo de punto 1 - Roja"), { target: { value: "APOYO" } });
    await waitFor(() => expect(hook.updateLine).toHaveBeenCalledWith("l1", { tipoPunto: "APOYO" }));
    fireEvent.change(screen.getByLabelText("Estado 1 - Roja"), { target: { value: "INACTIVA" } });
    await waitFor(() => expect(hook.updateLine).toHaveBeenCalledWith("l1", { estadoAsignacion: "INACTIVA" }));
  });

  it("removes a line after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(hook.removeLine).toHaveBeenCalledWith("l1"));
  });

  it("shows mutation errors", async () => {
    hook.addLine = vi.fn().mockRejectedValue(new Error("La línea ya está asociada"));
    renderDialog();
    fireEvent.change(screen.getByLabelText("Línea"), { target: { value: "l2" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar línea" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("La línea ya está asociada");
  });

  it("shows the load error with a retry button", () => {
    hook.error = "Sin conexión";
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Sin conexión");
    expect(hook.refresh).toHaveBeenCalled();
  });
});
