import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ParqueoForm } from "../../features/infrastructure/components/parqueos/parqueo-form";
import type { Estacion, Parqueo } from "../../features/infrastructure/types/infrastructure.types";

// Same caveat as parada-form.spec.tsx: labels are not associated via
// htmlFor/id, so fields are queried by type/order instead of getByLabelText.

const SAMPLE_ESTACIONES: Estacion[] = [
  {
    id: 2,
    nombreEstacion: "Estación Central",
    latitud: 14.6,
    longitud: -90.5,
    idParada: null,
    estadoEstacion: "ABIERTA" as Estacion["estadoEstacion"],
    fecha_creacion: "2026-01-01T00:00:00.000Z",
    fecha_actualizacion: "2026-01-01T00:00:00.000Z",
  },
];

const SAMPLE_PARQUEO: Parqueo = {
  id: 5,
  nombreParqueo: "Parqueo Norte",
  tipo: "PRIVADO" as Parqueo["tipo"],
  direccion: "5a Avenida 10-20",
  latitud: 14.62,
  longitud: -90.52,
  capacidad: 40,
  idEstacion: 2,
  estadoParqueo: "ABIERTA" as Parqueo["estadoParqueo"],
  fecha_creacion: "2026-01-01T00:00:00.000Z",
  fecha_actualizacion: "2026-01-01T00:00:00.000Z",
};

function renderForm(props: Partial<Parameters<typeof ParqueoForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(
    <ParqueoForm estaciones={SAMPLE_ESTACIONES} onSubmit={onSubmit} onCancel={onCancel} {...props} />,
  );
  const texts = utils.container.querySelectorAll("input[type='text']");
  const nombre = texts[0] as HTMLInputElement;
  const direccion = texts[1] as HTMLInputElement;
  const numbers = utils.container.querySelectorAll("input[type='number']");
  const latitud = numbers[0] as HTMLInputElement;
  const longitud = numbers[1] as HTMLInputElement;
  const capacidad = numbers[2] as HTMLInputElement;
  const selects = utils.container.querySelectorAll("select");
  const tipoSelect = selects[0] as HTMLSelectElement;
  const estacionSelect = selects[1] as HTMLSelectElement;
  const estadoSelect = selects[2] as HTMLSelectElement;
  return {
    ...utils,
    onSubmit,
    onCancel,
    nombre,
    direccion,
    latitud,
    longitud,
    capacidad,
    tipoSelect,
    estacionSelect,
    estadoSelect,
  };
}

describe("ParqueoForm", () => {
  it("renders empty fields in create mode", () => {
    const { nombre, direccion, latitud, longitud, capacidad, tipoSelect, estacionSelect, estadoSelect } =
      renderForm();

    expect(nombre).toHaveValue("");
    expect(direccion).toHaveValue("");
    expect(latitud).toHaveValue(null);
    expect(longitud).toHaveValue(null);
    expect(capacidad).toHaveValue(null);
    expect(tipoSelect).toHaveValue("PUBLICO");
    expect(estacionSelect).toHaveValue("");
    expect(estadoSelect).toHaveValue("ABIERTA");
  });

  it("renders pre-filled fields in edit mode", () => {
    const { nombre, direccion, latitud, longitud, capacidad, tipoSelect, estacionSelect } = renderForm({
      parqueo: SAMPLE_PARQUEO,
    });

    expect(nombre).toHaveValue("Parqueo Norte");
    expect(direccion).toHaveValue("5a Avenida 10-20");
    expect(latitud).toHaveValue(14.62);
    expect(longitud).toHaveValue(-90.52);
    expect(capacidad).toHaveValue(40);
    expect(tipoSelect).toHaveValue("PRIVADO");
    expect(estacionSelect).toHaveValue("2");
  });

  it("shows validation errors for empty required fields and invalid values", async () => {
    const { latitud, longitud, onSubmit } = renderForm();

    fireEvent.change(latitud, { target: { value: "95" } });
    fireEvent.change(longitud, { target: { value: "-200" } });
    // capacidad is left empty (not "-1"): the input has a native min="0"
    // attribute, and jsdom's HTML5 constraint validation silently cancels
    // the 'submit' event for an out-of-range value before React's onSubmit
    // ever runs. Leaving it empty still triggers the React-side isNaN check.
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre es requerido")).toBeInTheDocument();
    expect(screen.getByText("La dirección es requerida")).toBeInTheDocument();
    expect(screen.getByText("Latitud debe estar entre -90 y 90")).toBeInTheDocument();
    expect(screen.getByText("Longitud debe estar entre -180 y 180")).toBeInTheDocument();
    expect(screen.getByText("Capacidad debe ser >= 0")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit with correctly shaped data on success", async () => {
    const { nombre, direccion, latitud, longitud, capacidad, onSubmit } = renderForm();

    fireEvent.change(nombre, { target: { value: "Parqueo Sur" } });
    fireEvent.change(direccion, { target: { value: "6a Calle 1-1" } });
    fireEvent.change(latitud, { target: { value: "14.5" } });
    fireEvent.change(longitud, { target: { value: "-90.3" } });
    fireEvent.change(capacidad, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      nombreParqueo: "Parqueo Sur",
      tipo: "PUBLICO",
      direccion: "6a Calle 1-1",
      latitud: 14.5,
      longitud: -90.3,
      capacidad: 10,
      idEstacion: null,
      estadoParqueo: "ABIERTA",
    });
  });
});
