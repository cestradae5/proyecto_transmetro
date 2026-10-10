import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AccesoForm } from "../../features/infrastructure/components/paradas/acceso-form";
import {
  EstadoAcceso,
  TipoAcceso,
  type Acceso,
} from "../../features/infrastructure/types/infrastructure.types";

const ACCESO: Acceso = {
  idAcceso: "3",
  idParada: "5",
  nombreAcceso: "Acceso norte",
  latitud: 14.6,
  longitud: -90.5,
  tipoAcceso: TipoAcceso.RAMPA,
  estadoAcceso: EstadoAcceso.DESHABILITADO,
};

function renderForm(props: Partial<Parameters<typeof AccesoForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(<AccesoForm onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  return {
    ...utils,
    onSubmit,
    onCancel,
    nombre: screen.getByLabelText(/^Nombre del acceso/) as HTMLInputElement,
    tipo: screen.getByLabelText(/^Tipo/) as HTMLSelectElement,
    estado: screen.getByLabelText(/^Estado/) as HTMLSelectElement,
    latitud: screen.getByLabelText(/^Latitud/) as HTMLInputElement,
    longitud: screen.getByLabelText(/^Longitud/) as HTMLInputElement,
  };
}

describe("AccesoForm", () => {
  it("prefills the parada coordinates on create and defaults tipo/estado", () => {
    // DECIMAL columns arrive as strings at runtime.
    const { nombre, tipo, estado, latitud, longitud } = renderForm({
      defaultCoordinates: { latitud: "14.63490000", longitud: "-90.50690000" },
    });

    expect(nombre).toHaveValue("");
    expect(tipo).toHaveValue("PEATONAL");
    expect(estado).toHaveValue("HABILITADO");
    expect(latitud).toHaveValue(14.6349);
    expect(longitud).toHaveValue(-90.5069);
  });

  it("lists every tipo and estado allowed by the API", () => {
    const { tipo, estado } = renderForm();

    expect(Array.from(tipo.options).map((o) => o.value)).toEqual(["PEATONAL", "RAMPA", "ESCALERA", "ELEVADOR"]);
    expect(Array.from(estado.options).map((o) => o.value)).toEqual(["HABILITADO", "DESHABILITADO"]);
  });

  it("pre-fills the acceso in edit mode (its own coordinates win)", () => {
    const { nombre, tipo, estado, latitud, longitud } = renderForm({
      acceso: ACCESO,
      defaultCoordinates: { latitud: 1, longitud: 2 },
    });

    expect(nombre).toHaveValue("Acceso norte");
    expect(tipo).toHaveValue("RAMPA");
    expect(estado).toHaveValue("DESHABILITADO");
    expect(latitud).toHaveValue(14.6);
    expect(longitud).toHaveValue(-90.5);
  });

  it("validates nombre and coordinate ranges", async () => {
    const { latitud, longitud, onSubmit } = renderForm();

    fireEvent.change(latitud, { target: { value: "91" } });
    fireEvent.change(longitud, { target: { value: "-181" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre es requerido")).toBeInTheDocument();
    expect(screen.getByText("Latitud debe estar entre -90 y 90")).toBeInTheDocument();
    expect(screen.getByText("Longitud debe estar entre -180 y 180")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires coordinates", async () => {
    const { nombre, onSubmit } = renderForm();

    fireEvent.change(nombre, { target: { value: "Acceso sur" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Latitud debe estar entre -90 y 90")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a nombre longer than 120 characters", async () => {
    const { nombre, onSubmit } = renderForm({ defaultCoordinates: { latitud: 14, longitud: -90 } });

    fireEvent.change(nombre, { target: { value: "x".repeat(121) } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre no puede exceder 120 caracteres")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits numeric coordinates and the selected tipo/estado", async () => {
    const { nombre, tipo, estado, onSubmit } = renderForm({
      defaultCoordinates: { latitud: "14.63490000", longitud: "-90.50690000" },
    });

    fireEvent.change(nombre, { target: { value: " Acceso sur " } });
    fireEvent.change(tipo, { target: { value: "ELEVADOR" } });
    fireEvent.change(estado, { target: { value: "DESHABILITADO" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      nombreAcceso: "Acceso sur",
      tipoAcceso: "ELEVADOR",
      estadoAcceso: "DESHABILITADO",
      latitud: 14.6349,
      longitud: -90.5069,
    });
  });

  it("shows the submit error message", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Los datos del acceso no son válidos"));
    const { nombre } = renderForm({ onSubmit, defaultCoordinates: { latitud: 14, longitud: -90 } });

    fireEvent.change(nombre, { target: { value: "Acceso sur" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Los datos del acceso no son válidos");
  });
});
