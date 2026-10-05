import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { AsignacionesEstacionTable } from "../../features/fleet/components/estaciones/asignaciones-estacion-table";
import type { StationAssignment } from "../../features/fleet/types/fleet.types";
import type { Estacion, Linea } from "../../features/infrastructure/types/infrastructure.types";

vi.mock("../../features/fleet/hooks/use-estacion-lineas", () => ({
  useEstacionLineas: () => ({
    items: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    addLine: vi.fn(),
    updateLine: vi.fn(),
    removeLine: vi.fn(),
  }),
}));

const ASSIGNMENTS: StationAssignment[] = [
  {
    idAsignacionEstacion: "a1",
    idEmpleado: "e1",
    nombreEmpleado: "Ana",
    idEstacion: "10",
    nombreEstacion: "Central",
    estadoAsignacion: "ACTIVA",
    fechaAsignacion: "2024-01-01T12:00:00Z",
  },
];

const ESTACIONES = [
  { idEstacion: 10, nombreEstacion: "Central" },
  { idEstacion: 20, nombreEstacion: "Norte" },
] as Estacion[];

function renderTable(canManage: boolean, assignments = ASSIGNMENTS) {
  const props = {
    onAssign: vi.fn().mockResolvedValue(undefined),
    onReassign: vi.fn().mockResolvedValue(undefined),
    onUnassign: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <AsignacionesEstacionTable
      assignments={assignments}
      operadores={[{ idEmpleado: "e2", nombre: "Beto" }]}
      estaciones={ESTACIONES}
      lineas={[] as Linea[]}
      canManage={canManage}
      {...props}
    />
  );
  return props;
}

afterEach(() => vi.restoreAllMocks());

describe("AsignacionesEstacionTable", () => {
  it("lists assignments without actions when the user cannot manage", () => {
    renderTable(false);
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Central")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Asignar operador" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reasignar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
  });

  it("shows an empty message", () => {
    renderTable(true, []);
    expect(screen.getByText("No hay operadores asignados a estaciones.")).toBeInTheDocument();
  });

  it("unassigns after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const props = renderTable(true);
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(props.onUnassign).toHaveBeenCalledWith("a1"));
  });

  it("does not unassign when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const props = renderTable(true);
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(props.onUnassign).not.toHaveBeenCalled();
  });

  it("opens the assign and reassign dialogs", () => {
    renderTable(true);
    fireEvent.click(screen.getByRole("button", { name: "Asignar operador" }));
    expect(screen.getByRole("dialog", { name: "Asignar operador de estación" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Reasignar" }));
    expect(screen.getByRole("dialog", { name: "Reasignar operador de estación" })).toBeInTheDocument();
  });

  it("opens the station lines dialog", () => {
    renderTable(true);
    fireEvent.click(screen.getByRole("button", { name: "Líneas" }));
    expect(screen.getByRole("dialog", { name: "Líneas de la estación" })).toBeInTheDocument();
  });
});
