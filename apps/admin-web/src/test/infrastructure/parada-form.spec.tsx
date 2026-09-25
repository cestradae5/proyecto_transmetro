import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ParadaForm } from "../../features/infrastructure/components/paradas/parada-form";
import type { Parada } from "../../features/infrastructure/types/infrastructure.types";

// The form's <label> elements are not programmatically associated with their
// inputs (no htmlFor/id), so getByLabelText cannot resolve them. Query by
// input type/order instead, matching the DOM order in parada-form.tsx.

const SAMPLE_PARADA: Parada = {
  id: 7,
  nombreParada: "Parada Central",
  latitud: 14.6349,
  longitud: -90.5069,
  estadoParada: "ACTIVA" as Parada["estadoParada"],
  fecha_creacion: "2026-01-01T00:00:00.000Z",
  fecha_actualizacion: "2026-01-01T00:00:00.000Z",
};

function renderForm(props: Partial<Parameters<typeof ParadaForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(<ParadaForm onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  const nombre = utils.container.querySelector("input[type='text']") as HTMLInputElement;
  const numbers = utils.container.querySelectorAll("input[type='number']");
  const latitud = numbers[0] as HTMLInputElement;
  const longitud = numbers[1] as HTMLInputElement;
  const estado = utils.container.querySelector("select") as HTMLSelectElement;
  return { ...utils, onSubmit, onCancel, nombre, latitud, longitud, estado };
}

describe("ParadaForm", () => {
  it("renders empty fields in create mode", () => {
    const { nombre, latitud, longitud, estado } = renderForm();

    expect(nombre).toHaveValue("");
    expect(latitud).toHaveValue(null);
    expect(longitud).toHaveValue(null);
    expect(estado).toHaveValue("ACTIVA");
  });

  it("renders pre-filled fields in edit mode", () => {
    const { nombre, latitud, longitud } = renderForm({ parada: SAMPLE_PARADA });

    expect(nombre).toHaveValue("Parada Central");
    expect(latitud).toHaveValue(14.6349);
    expect(longitud).toHaveValue(-90.5069);
  });

  it("shows validation errors for empty nombre and out-of-range lat/long", async () => {
    const { latitud, longitud, onSubmit } = renderForm();

    fireEvent.change(latitud, { target: { value: "95" } });
    fireEvent.change(longitud, { target: { value: "-200" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre es requerido")).toBeInTheDocument();
    expect(screen.getByText("Latitud debe estar entre -90 y 90")).toBeInTheDocument();
    expect(screen.getByText("Longitud debe estar entre -180 y 180")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with correctly shaped data on success", async () => {
    const { nombre, latitud, longitud, estado, onSubmit } = renderForm();

    fireEvent.change(nombre, { target: { value: "Parada Nueva" } });
    fireEvent.change(latitud, { target: { value: "14.5" } });
    fireEvent.change(longitud, { target: { value: "-90.3" } });
    fireEvent.change(estado, { target: { value: "MANTENIMIENTO" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      nombreParada: "Parada Nueva",
      latitud: 14.5,
      longitud: -90.3,
      estadoParada: "MANTENIMIENTO",
    });
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const { onCancel } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
