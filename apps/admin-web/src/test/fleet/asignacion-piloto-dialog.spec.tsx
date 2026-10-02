import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AsignacionPilotoDialog } from "../../features/fleet/components/unidades/asignacion-piloto-dialog";
import { EstadoUnidad, type Piloto, type Unidad } from "../../features/fleet/types/fleet.types";

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

const OTHER_UNIT = unit({ idUnidad: "2", numeroPlaca: "P-002", idEmpleadoPiloto: "e2" });
const PILOTOS: Piloto[] = [
  { idEmpleado: "e1", nombre: "Ana" },
  { idEmpleado: "e2", nombre: "Beto", idUnidad: "2" },
  { idEmpleado: "e3", nombre: "Carla", idUnidad: "1" },
];

function renderDialog(u: Unidad, overrides: Record<string, unknown> = {}, unidades: Unidad[] = [u, OTHER_UNIT]) {
  const props = {
    onAssign: vi.fn().mockResolvedValue(undefined),
    onReassign: vi.fn().mockResolvedValue(undefined),
    onUnassign: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AsignacionPilotoDialog unit={u} pilotos={PILOTOS} unidades={unidades} {...props} />);
  return props;
}

afterEach(() => vi.restoreAllMocks());

describe("AsignacionPilotoDialog", () => {
  it("assigns a free pilot and closes", async () => {
    const props = renderDialog(unit());
    const submit = screen.getByRole("button", { name: "Asignar" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Piloto"), { target: { value: "e1" } });
    fireEvent.click(submit);

    await waitFor(() => expect(props.onAssign).toHaveBeenCalledWith("1", "e1"));
    expect(props.onReassign).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("labels pilots on another unit and moves them with Reasignar", async () => {
    const props = renderDialog(unit());
    expect(screen.getByRole("option", { name: "Beto (en unidad P-002)" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Piloto"), { target: { value: "e2" } });
    expect(screen.getByText(/será movido desde la unidad P-002/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reasignar" }));

    await waitFor(() => expect(props.onReassign).toHaveBeenCalledWith("1", "e2"));
    expect(props.onAssign).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("blocks moving a pilot whose current unit is EN_SERVICIO", () => {
    renderDialog(unit(), {}, [
      unit(),
      unit({ idUnidad: "2", numeroPlaca: "P-002", estadoUnidad: EstadoUnidad.EN_SERVICIO }),
    ]);
    fireEvent.change(screen.getByLabelText("Piloto"), { target: { value: "e2" } });
    expect(screen.getByRole("button", { name: "Reasignar" })).toBeDisabled();
    expect(screen.getByText(/No se puede mover el piloto de una unidad En servicio/)).toBeInTheDocument();
  });

  it("disables submit when the selected pilot is already on this unit", () => {
    renderDialog(unit());
    fireEvent.change(screen.getByLabelText("Piloto"), { target: { value: "e3" } });
    expect(screen.getByRole("button", { name: "Asignar" })).toBeDisabled();
    expect(screen.getByText("Este piloto ya está asignado a esta unidad.")).toBeInTheDocument();
  });

  it("shows the current pilot name (fallback to id) and no selector", () => {
    renderDialog(unit({ idEmpleadoPiloto: "e3" }));
    expect(screen.getByText("Carla", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Piloto")).not.toBeInTheDocument();
  });

  it("falls back to the employee id when the pilot is not in the list", () => {
    renderDialog(unit({ idEmpleadoPiloto: "zzz" }));
    expect(screen.getByText("zzz", { selector: "span" })).toBeInTheDocument();
  });

  it("asks for confirmation before removing the pilot", async () => {
    const props = renderDialog(unit({ idEmpleadoPiloto: "e3" }));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Quitar piloto" }));
    expect(props.onUnassign).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Quitar piloto" }));
    await waitFor(() => expect(props.onUnassign).toHaveBeenCalledWith("1"));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("disables removal and explains why for EN_SERVICIO units", () => {
    renderDialog(unit({ idEmpleadoPiloto: "e3", estadoUnidad: EstadoUnidad.EN_SERVICIO }));
    expect(screen.getByRole("button", { name: "Quitar piloto" })).toBeDisabled();
    expect(screen.getByText(/No se puede quitar el piloto a una unidad En servicio/)).toBeInTheDocument();
  });

  it("shows submit errors and keeps the dialog open", async () => {
    const props = renderDialog(unit(), {
      onAssign: vi.fn().mockRejectedValue(new Error("El empleado no existe")),
    });
    fireEvent.change(screen.getByLabelText("Piloto"), { target: { value: "e1" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El empleado no existe");
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
