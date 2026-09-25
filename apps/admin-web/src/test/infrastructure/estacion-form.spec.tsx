import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EstacionForm } from "../../features/infrastructure/components/estaciones/estacion-form";
import type { Estacion, Parada } from "../../features/infrastructure/types/infrastructure.types";

// Same caveat as parada-form.spec.tsx: labels are not associated via
// htmlFor/id, so fields are queried by type/order instead of getByLabelText.

const SAMPLE_PARADAS: Parada[] = [
  {
    id: 1,
    nombreParada: "Parada A",
    latitud: 14.6,
    longitud: -90.5,
    estadoParada: "ACTIVA" as Parada["estadoParada"],
    fecha_creacion: "2026-01-01T00:00:00.000Z",
    fecha_actualizacion: "2026-01-01T00:00:00.000Z",
  },
];

const SAMPLE_ESTACION: Estacion = {
  id: 3,
  nombreEstacion: "Estación Norte",
  latitud: 14.65,
  longitud: -90.51,
  idParada: 1,
  estadoEstacion: "ABIERTA" as Estacion["estadoEstacion"],
  fecha_creacion: "2026-01-01T00:00:00.000Z",
  fecha_actualizacion: "2026-01-01T00:00:00.000Z",
};

function renderForm(props: Partial<Parameters<typeof EstacionForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(
    <EstacionForm paradas={SAMPLE_PARADAS} onSubmit={onSubmit} onCancel={onCancel} {...props} />,
  );
  const nombre = utils.container.querySelector("input[type='text']") as HTMLInputElement;
  const numbers = utils.container.querySelectorAll("input[type='number']");
  const latitud = numbers[0] as HTMLInputElement;
  const longitud = numbers[1] as HTMLInputElement;
  const selects = utils.container.querySelectorAll("select");
  const paradaSelect = selects[0] as HTMLSelectElement;
  const estadoSelect = selects[1] as HTMLSelectElement;
  return { ...utils, onSubmit, onCancel, nombre, latitud, longitud, paradaSelect, estadoSelect };
}

describe("EstacionForm", () => {
  it("renders empty fields in create mode", () => {
    const { nombre, latitud, longitud, paradaSelect, estadoSelect } = renderForm();

    expect(nombre).toHaveValue("");
    expect(latitud).toHaveValue(null);
    expect(longitud).toHaveValue(null);
    expect(paradaSelect).toHaveValue("");
    expect(estadoSelect).toHaveValue("ABIERTA");
  });

  it("renders pre-filled fields in edit mode", () => {
    const { nombre, latitud, longitud, paradaSelect } = renderForm({ estacion: SAMPLE_ESTACION });

    expect(nombre).toHaveValue("Estación Norte");
    expect(latitud).toHaveValue(14.65);
    expect(longitud).toHaveValue(-90.51);
    expect(paradaSelect).toHaveValue("1");
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

  it("calls onSubmit with correctly shaped data on success, including null idParada when unset", async () => {
    const { nombre, latitud, longitud, onSubmit } = renderForm();

    fireEvent.change(nombre, { target: { value: "Estación Sur" } });
    fireEvent.change(latitud, { target: { value: "14.5" } });
    fireEvent.change(longitud, { target: { value: "-90.3" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      nombreEstacion: "Estación Sur",
      latitud: 14.5,
      longitud: -90.3,
      idParada: null,
      estadoEstacion: "ABIERTA",
    });
  });

  it("submits the selected idParada as a number when set", async () => {
    const { nombre, latitud, longitud, paradaSelect, onSubmit } = renderForm();

    fireEvent.change(nombre, { target: { value: "Estación Sur" } });
    fireEvent.change(latitud, { target: { value: "14.5" } });
    fireEvent.change(longitud, { target: { value: "-90.3" } });
    fireEvent.change(paradaSelect, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].idParada).toBe(1);
  });
});
