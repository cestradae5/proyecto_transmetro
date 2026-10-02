import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AsignacionLineaDialog } from "../../features/fleet/components/unidades/asignacion-linea-dialog";
import { EstadoUnidad, type Unidad } from "../../features/fleet/types/fleet.types";
import type { Linea } from "../../features/infrastructure/types/infrastructure.types";

const LINEAS = [
  { idLinea: "4", numeroLinea: "L4", nombreLinea: "Norte" },
  { idLinea: "5", numeroLinea: "L5", nombreLinea: "Sur" },
] as unknown as Linea[];

function unit(overrides: Partial<Unidad> = {}): Unidad {
  return {
    idUnidad: "1",
    numeroPlaca: "P-001",
    marca: "Volvo",
    modelo: "B8R",
    anio: 2020,
    capacidadPasajeros: 80,
    estadoUnidad: EstadoUnidad.DISPONIBLE,
    fechaRegistro: "2024-01-01",
    fechaActualizacion: "2024-01-01",
    ...overrides,
  };
}

function renderDialog(u: Unidad, overrides: Record<string, unknown> = {}) {
  const props = {
    onAssign: vi.fn().mockResolvedValue(undefined),
    onReassign: vi.fn().mockResolvedValue(undefined),
    onUnassign: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AsignacionLineaDialog unit={u} lineas={LINEAS} {...props} />);
  return props;
}

afterEach(() => vi.restoreAllMocks());

describe("AsignacionLineaDialog", () => {
  it("assigns a line to a unit without one and closes", async () => {
    const props = renderDialog(unit());
    const submit = screen.getByRole("button", { name: "Asignar" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Línea"), { target: { value: "5" } });
    fireEvent.click(submit);

    await waitFor(() => expect(props.onAssign).toHaveBeenCalledWith("1", "5"));
    expect(props.onClose).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Quitar asignación" })).not.toBeInTheDocument();
  });

  it("shows the current line and disables reassign for the same line", () => {
    renderDialog(unit({ idLinea: "4" }));
    expect(screen.getByText("L4 - Norte", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reasignar" })).toBeDisabled();
    expect(screen.getByText(/última parada reportada/)).toBeInTheDocument();
  });

  it("reassigns to a different line", async () => {
    const props = renderDialog(unit({ idLinea: "4" }));
    fireEvent.change(screen.getByLabelText("Nueva línea"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Reasignar" }));

    await waitFor(() => expect(props.onReassign).toHaveBeenCalledWith("1", "5"));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("asks for confirmation before removing the assignment", async () => {
    const props = renderDialog(unit({ idLinea: "4" }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Quitar asignación" }));
    expect(props.onUnassign).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Quitar asignación" }));
    await waitFor(() => expect(props.onUnassign).toHaveBeenCalledWith("1"));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("disables removal and explains why for EN_SERVICIO units", () => {
    renderDialog(unit({ idLinea: "4", estadoUnidad: EstadoUnidad.EN_SERVICIO }));
    expect(screen.getByRole("button", { name: "Quitar asignación" })).toBeDisabled();
    expect(screen.getByText(/No se puede quitar la línea a una unidad En servicio/)).toBeInTheDocument();
  });

  it("shows submit errors and keeps the dialog open", async () => {
    const props = renderDialog(unit(), { onAssign: vi.fn().mockRejectedValue(new Error("La línea no existe")) });
    fireEvent.change(screen.getByLabelText("Línea"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La línea no existe");
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
