import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AsignacionEstacionDialog } from "../../features/fleet/components/estaciones/asignacion-estacion-dialog";
import type { StationAssignment, StationOperator } from "../../features/fleet/types/fleet.types";
import type { Estacion } from "../../features/infrastructure/types/infrastructure.types";

const OPERADORES: StationOperator[] = [
  { idEmpleado: "e1", nombre: "Ana" },
  { idEmpleado: "e2", nombre: "Beto", idEstacionActual: "10" },
];

const ESTACIONES = [
  { idEstacion: 10, nombreEstacion: "Central" },
  { idEstacion: 20, nombreEstacion: "Norte" },
] as Estacion[];

const ASSIGNMENT: StationAssignment = {
  idAsignacionEstacion: "a1",
  idEmpleado: "e2",
  nombreEmpleado: "Beto",
  idEstacion: "10",
  nombreEstacion: "Central",
  estadoAsignacion: "ACTIVA",
  fechaAsignacion: "2024-01-01T00:00:00Z",
};

function renderDialog(assignment?: StationAssignment, overrides: Record<string, unknown> = {}) {
  const props = {
    onAssign: vi.fn().mockResolvedValue(undefined),
    onReassign: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<AsignacionEstacionDialog assignment={assignment} operadores={OPERADORES} estaciones={ESTACIONES} {...props} />);
  return props;
}

afterEach(() => vi.restoreAllMocks());

describe("AsignacionEstacionDialog", () => {
  it("assigns a free operator to a station and closes", async () => {
    const props = renderDialog();
    expect(screen.getByRole("button", { name: "Asignar" })).toBeDisabled();
    expect(screen.queryByRole("option", { name: "Beto" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Operador"), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText("Estación"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => expect(props.onAssign).toHaveBeenCalledWith("e1", "20"));
    expect(props.onReassign).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("reassigns to another station, excluding the current one", async () => {
    const props = renderDialog(ASSIGNMENT);
    expect(screen.queryByLabelText("Operador")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Central" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Estación"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Reasignar" }));

    await waitFor(() => expect(props.onReassign).toHaveBeenCalledWith("a1", "20"));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows the error and stays open when the action fails", async () => {
    const props = renderDialog(undefined, { onAssign: vi.fn().mockRejectedValue(new Error("Estación inexistente")) });
    fireEvent.change(screen.getByLabelText("Operador"), { target: { value: "e1" } });
    fireEvent.change(screen.getByLabelText("Estación"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Estación inexistente");
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
