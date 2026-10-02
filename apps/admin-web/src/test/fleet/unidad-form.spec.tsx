import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UnidadForm } from "../../features/fleet/components/unidades/unidad-form";
import { EstadoUnidad, type Unidad } from "../../features/fleet/types/fleet.types";

const SAMPLE_UNIDAD: Unidad = {
  idUnidad: "7",
  numeroPlaca: "P-123ABC",
  marca: "Volvo",
  modelo: "B8R",
  anio: 2020,
  capacidadPasajeros: 80,
  estadoUnidad: EstadoUnidad.MANTENIMIENTO,
  fechaRegistro: "2024-01-01",
  fechaActualizacion: "2024-01-01",
};

function renderForm(unidad?: Unidad) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(<UnidadForm unidad={unidad} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel };
}

function fillValid() {
  fireEvent.change(screen.getByLabelText(/Placa/), { target: { value: "  P-999ZZZ " } });
  fireEvent.change(screen.getByLabelText(/Marca/), { target: { value: "Mercedes" } });
  fireEvent.change(screen.getByLabelText(/Modelo/), { target: { value: "O500" } });
  fireEvent.change(screen.getByLabelText(/Año/), { target: { value: "2022" } });
  fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: "90" } });
}

describe("UnidadForm", () => {
  it("shows required errors and does not submit when empty", async () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("La placa es requerida")).toBeInTheDocument();
    expect(screen.getByText("La marca es requerida")).toBeInTheDocument();
    expect(screen.getByText("El modelo es requerido")).toBeInTheDocument();
    expect(screen.getByText("El año debe ser un número entero")).toBeInTheDocument();
    expect(screen.getByText("La capacidad debe ser un entero mayor o igual a 1")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("validates max lengths, integer year and capacity >= 1", async () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText(/Placa/), { target: { value: "x".repeat(21) } });
    fireEvent.change(screen.getByLabelText(/Marca/), { target: { value: "x".repeat(61) } });
    fireEvent.change(screen.getByLabelText(/Modelo/), { target: { value: "x".repeat(61) } });
    fireEvent.change(screen.getByLabelText(/Año/), { target: { value: "2020.5" } });
    fireEvent.change(screen.getByLabelText(/Capacidad/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("La placa no puede exceder 20 caracteres")).toBeInTheDocument();
    expect(screen.getByText("La marca no puede exceder 60 caracteres")).toBeInTheDocument();
    expect(screen.getByText("El modelo no puede exceder 60 caracteres")).toBeInTheDocument();
    expect(screen.getByText("El año debe ser un número entero")).toBeInTheDocument();
    expect(screen.getByText("La capacidad debe ser un entero mayor o igual a 1")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hides the estado select on create and submits DISPONIBLE with numeric fields", async () => {
    const { onSubmit } = renderForm();
    expect(screen.queryByLabelText(/Estado/)).not.toBeInTheDocument();

    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      numeroPlaca: "P-999ZZZ",
      marca: "Mercedes",
      modelo: "O500",
      anio: 2022,
      capacidadPasajeros: 90,
      estadoUnidad: "DISPONIBLE",
    });
    const payload = onSubmit.mock.calls[0]![0];
    expect(typeof payload.anio).toBe("number");
    expect(typeof payload.capacidadPasajeros).toBe("number");
  });

  it("prefills in edit mode and offers all four states", async () => {
    const { onSubmit } = renderForm(SAMPLE_UNIDAD);
    expect(screen.getByLabelText(/Placa/)).toHaveValue("P-123ABC");
    const select = screen.getByLabelText(/Estado/) as HTMLSelectElement;
    expect(select).toHaveValue("MANTENIMIENTO");
    expect(Array.from(select.options).map((o) => o.value).sort()).toEqual([
      "DISPONIBLE",
      "EN_SERVICIO",
      "FUERA_DE_SERVICIO",
      "MANTENIMIENTO",
    ]);

    fireEvent.change(select, { target: { value: "EN_SERVICIO" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ anio: 2020, capacidadPasajeros: 80, estadoUnidad: "EN_SERVICIO" }),
    );
  });

  it("shows the thrown error message when submit fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("La placa ya existe"));
    render(<UnidadForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("La placa ya existe")).toBeInTheDocument();
  });

  it("calls onCancel", () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
