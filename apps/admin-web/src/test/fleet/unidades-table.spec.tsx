import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { UnidadesTable } from "../../features/fleet/components/unidades/unidades-table";
import { EstadoUnidad, type Unidad } from "../../features/fleet/types/fleet.types";

function unit(overrides: Partial<Unidad>): Unidad {
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

const UNITS: Unidad[] = [
  unit({ idUnidad: "1", numeroPlaca: "P-001", idLinea: "4", idEmpleadoPiloto: "emp-9", idLineaParadaActual: "33", estadoUnidad: EstadoUnidad.EN_SERVICIO }),
  unit({ idUnidad: "2", numeroPlaca: "P-002", marca: "Mercedes", modelo: "O500" }),
  unit({ idUnidad: "3", numeroPlaca: "P-003", marca: "Scania", modelo: "K320", estadoUnidad: EstadoUnidad.FUERA_DE_SERVICIO }),
];

function renderTable(props: Partial<Parameters<typeof UnidadesTable>[0]> = {}) {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(<UnidadesTable unidades={UNITS} canManage onUpdate={onUpdate} onDelete={onDelete} {...props} />);
  return { onUpdate, onDelete };
}

function rowOf(placa: string) {
  return screen.getByText(placa).closest("tr") as HTMLElement;
}

afterEach(() => vi.restoreAllMocks());

describe("UnidadesTable", () => {
  it("renders rows with assignments or '-' placeholders", () => {
    renderTable();
    const first = within(rowOf("P-001"));
    expect(first.getByText("Volvo B8R")).toBeInTheDocument();
    expect(first.getByText("EN_SERVICIO")).toBeInTheDocument();
    expect(first.getByText("4")).toBeInTheDocument();
    expect(first.getByText("emp-9")).toBeInTheDocument();
    expect(first.getByText("33")).toBeInTheDocument();
    expect(within(rowOf("P-002")).getAllByText("-")).toHaveLength(3);
  });

  it("filters by search text and by estado", () => {
    renderTable();
    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "merc" } });
    expect(screen.getByText("P-002")).toBeInTheDocument();
    expect(screen.queryByText("P-001")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filtrar por estado"), { target: { value: "FUERA_DE_SERVICIO" } });
    expect(screen.getByText("P-003")).toBeInTheDocument();
    expect(screen.queryByText("P-001")).not.toBeInTheDocument();
    expect(screen.queryByText("P-002")).not.toBeInTheDocument();
  });

  it("calls onDelete after confirm and not when cancelled", async () => {
    const { onDelete } = renderTable();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    fireEvent.click(within(rowOf("P-002")).getByRole("button", { name: "Dar de baja" }));
    expect(onDelete).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(within(rowOf("P-002")).getByRole("button", { name: "Dar de baja" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("2"));
  });

  it("hides 'Dar de baja' for FUERA_DE_SERVICIO units", () => {
    renderTable();
    expect(within(rowOf("P-003")).queryByRole("button", { name: "Dar de baja" })).not.toBeInTheDocument();
    expect(within(rowOf("P-003")).getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });

  it("surfaces delete errors to the user", async () => {
    renderTable({ onDelete: vi.fn().mockRejectedValue(new Error("No se pudo dar de baja")) });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(within(rowOf("P-002")).getByRole("button", { name: "Dar de baja" }));
    expect(await screen.findByText("No se pudo dar de baja")).toBeInTheDocument();
  });

  it("opens the edit dialog and surfaces update errors keeping it open", async () => {
    const onUpdate = vi.fn().mockRejectedValue(new Error("La unidad requiere línea y piloto"));
    renderTable({ onUpdate });
    fireEvent.click(within(rowOf("P-002")).getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Editar Unidad")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Estado/), { target: { value: "EN_SERVICIO" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("La unidad requiere línea y piloto")).toBeInTheDocument();
    expect(onUpdate).toHaveBeenCalledWith("2", expect.objectContaining({ estadoUnidad: "EN_SERVICIO" }));
    expect(screen.getByText("Editar Unidad")).toBeInTheDocument();
  });

  it("is read-only without canManage", () => {
    renderTable({ canManage: false });
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dar de baja" })).not.toBeInTheDocument();
    expect(screen.queryByText("Acciones")).not.toBeInTheDocument();
  });
});
