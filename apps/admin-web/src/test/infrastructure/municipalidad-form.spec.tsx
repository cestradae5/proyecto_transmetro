import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MunicipalidadForm } from "../../features/infrastructure/components/municipalidades/municipalidad-form";
import {
  EstadoMunicipalidad,
  type Municipalidad,
} from "../../features/infrastructure/types/infrastructure.types";

const SAMPLE: Municipalidad = {
  idMunicipalidad: "1",
  nombreMunicipalidad: "Mixco",
  departamento: "Guatemala",
  estadoMunicipalidad: EstadoMunicipalidad.INACTIVA,
};

function renderForm(props: Partial<Parameters<typeof MunicipalidadForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(<MunicipalidadForm onSubmit={onSubmit} onCancel={onCancel} {...props} />);
  return {
    ...utils,
    onSubmit,
    onCancel,
    nombre: screen.getByLabelText(/^Nombre/) as HTMLInputElement,
    departamento: screen.getByLabelText(/^Departamento/) as HTMLInputElement,
    estado: screen.getByLabelText(/^Estado/) as HTMLSelectElement,
  };
}

describe("MunicipalidadForm", () => {
  it("renders empty fields with ACTIVA by default in create mode", () => {
    const { nombre, departamento, estado } = renderForm();

    expect(nombre).toHaveValue("");
    expect(departamento).toHaveValue("");
    expect(estado).toHaveValue("ACTIVA");
    expect(Array.from(estado.options).map((o) => o.value)).toEqual(["ACTIVA", "INACTIVA"]);
  });

  it("pre-fills fields in edit mode", () => {
    const { nombre, departamento, estado } = renderForm({ municipalidad: SAMPLE });

    expect(nombre).toHaveValue("Mixco");
    expect(departamento).toHaveValue("Guatemala");
    expect(estado).toHaveValue("INACTIVA");
  });

  it("requires nombre and departamento", async () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre es requerido")).toBeInTheDocument();
    expect(screen.getByText("El departamento es requerido")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("enforces the API max lengths (nombre 120, departamento 60)", async () => {
    const { nombre, departamento, onSubmit } = renderForm();

    fireEvent.change(nombre, { target: { value: "a".repeat(121) } });
    fireEvent.change(departamento, { target: { value: "b".repeat(61) } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El nombre no puede exceder 120 caracteres")).toBeInTheDocument();
    expect(screen.getByText("El departamento no puede exceder 60 caracteres")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits trimmed values with the selected estado", async () => {
    const { nombre, departamento, estado, onSubmit } = renderForm();

    fireEvent.change(nombre, { target: { value: "  Villa Nueva " } });
    fireEvent.change(departamento, { target: { value: " Guatemala " } });
    fireEvent.change(estado, { target: { value: "INACTIVA" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      nombreMunicipalidad: "Villa Nueva",
      departamento: "Guatemala",
      estadoMunicipalidad: "INACTIVA",
    });
  });

  it("shows the submit error message (e.g. duplicate name)", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Ya existe una municipalidad con ese nombre"));
    const { nombre, departamento } = renderForm({ onSubmit });

    fireEvent.change(nombre, { target: { value: "Mixco" } });
    fireEvent.change(departamento, { target: { value: "Guatemala" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una municipalidad con ese nombre");
  });

  it("calls onCancel", () => {
    const { onCancel } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
