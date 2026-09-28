import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AfectacionForm } from "../../features/infrastructure/components/afectaciones/afectacion-form";
import type { Afectacion, Estacion, Parada } from "../../features/infrastructure/types/infrastructure.types";

// Same caveat as parada-form.spec.tsx: labels are not associated via
// htmlFor/id, so fields are queried by role/type/order instead of
// getByLabelText.

const SAMPLE_PARADAS: Parada[] = [
  {
    idParada: 1,
    nombreParada: "Parada A",
    latitud: 14.6,
    longitud: -90.5,
    estadoParada: "ACTIVA" as Parada["estadoParada"],
    fecha_creacion: "2026-01-01T00:00:00.000Z",
    fecha_actualizacion: "2026-01-01T00:00:00.000Z",
  },
];

const SAMPLE_ESTACIONES: Estacion[] = [
  {
    idEstacion: 2,
    nombreEstacion: "Estación B",
    latitud: 14.61,
    longitud: -90.51,
    idParada: null,
    estadoEstacion: "ACTIVA" as Estacion["estadoEstacion"],
  },
];

const SAMPLE_AFECTACION: Afectacion = {
  idAfectacion: "6",
  tipoAfectacion: "TEMPORAL" as Afectacion["tipoAfectacion"],
  motivo: "Obra vial",
  fechaInicio: "2026-02-01T00:00:00.000Z",
  fechaFin: null,
  idParada: "1",
  idEstacion: null,
  estadoAfectacion: "ACTIVA" as Afectacion["estadoAfectacion"],
};

function renderForm(props: Partial<Parameters<typeof AfectacionForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(
    <AfectacionForm
      paradas={SAMPLE_PARADAS}
      estaciones={SAMPLE_ESTACIONES}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  const motivo = utils.container.querySelector("textarea") as HTMLTextAreaElement;
  const dates = utils.container.querySelectorAll("input[type='date']");
  const fechaInicio = dates[0]! as HTMLInputElement;
  const fechaFin = dates[1]! as HTMLInputElement;
  const radios = screen.getAllByRole("radio") as HTMLInputElement[];
  const paradaRadio = radios[0]!;
  const estacionRadio = radios[1]!;
  const selects = utils.container.querySelectorAll("select");
  const tipoSelect = selects[0] as HTMLSelectElement;
  const paradaSelect = selects[1] as HTMLSelectElement;
  const estacionSelect = selects[2] as HTMLSelectElement;
  const estadoSelect = selects[3] as HTMLSelectElement;
  return {
    ...utils,
    onSubmit,
    onCancel,
    motivo,
    fechaInicio,
    fechaFin,
    paradaRadio,
    estacionRadio,
    tipoSelect,
    paradaSelect,
    estacionSelect,
    estadoSelect,
  };
}

describe("AfectacionForm", () => {
  it("renders empty fields in create mode, defaulting target to parada", () => {
    const { motivo, fechaInicio, fechaFin, paradaRadio, estacionRadio, paradaSelect, estacionSelect } =
      renderForm();

    expect(motivo).toHaveValue("");
    expect(fechaInicio).toHaveValue("");
    expect(fechaFin).toHaveValue("");
    expect(paradaRadio).toBeChecked();
    expect(estacionRadio).not.toBeChecked();
    expect(paradaSelect).not.toBeDisabled();
    expect(estacionSelect).toBeDisabled();
  });

  it("renders pre-filled fields in edit mode, targeting the parada", () => {
    const { motivo, fechaInicio, paradaRadio, estacionRadio, paradaSelect } = renderForm({
      afectacion: SAMPLE_AFECTACION,
    });

    expect(motivo).toHaveValue("Obra vial");
    expect(fechaInicio).toHaveValue("2026-02-01");
    expect(paradaRadio).toBeChecked();
    expect(estacionRadio).not.toBeChecked();
    expect(paradaSelect).toHaveValue("1");
  });

  it("shows validation errors for empty motivo/fechaInicio and end date before start date", async () => {
    const { fechaInicio, fechaFin, onSubmit } = renderForm();

    fireEvent.change(fechaInicio, { target: { value: "2026-03-10" } });
    fireEvent.change(fechaFin, { target: { value: "2026-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El motivo es requerido")).toBeInTheDocument();
    expect(screen.getByText("La fecha de fin debe ser posterior a la fecha de inicio")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires a fechaInicio when it is left empty", async () => {
    const { motivo, onSubmit } = renderForm();

    fireEvent.change(motivo, { target: { value: "Mantenimiento de vía" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("La fecha de inicio es requerida")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires selecting a parada or estación (XOR target)", async () => {
    const { motivo, fechaInicio, onSubmit } = renderForm();

    fireEvent.change(motivo, { target: { value: "Mantenimiento de vía" } });
    fireEvent.change(fechaInicio, { target: { value: "2026-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Debe seleccionar una parada o una estación")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("XOR: switching the radio to estación disables/clears the parada selection and vice versa", () => {
    const { paradaSelect, estacionSelect, paradaRadio, estacionRadio } = renderForm();

    // Default: parada target is active.
    fireEvent.change(paradaSelect, { target: { value: "1" } });
    expect(paradaSelect).toHaveValue("1");

    // Switching to the estación radio clears idParada and swaps which
    // select is enabled (the form's XOR behavior).
    fireEvent.click(estacionRadio);
    expect(estacionRadio).toBeChecked();
    expect(paradaRadio).not.toBeChecked();
    expect(estacionSelect).not.toBeDisabled();
    expect(paradaSelect).toBeDisabled();
    expect(paradaSelect).toHaveValue("");

    // Switching back to the parada radio clears idEstacion again.
    fireEvent.change(estacionSelect, { target: { value: "2" } });
    fireEvent.click(paradaRadio);
    expect(paradaRadio).toBeChecked();
    expect(paradaSelect).not.toBeDisabled();
    expect(estacionSelect).toBeDisabled();
    expect(estacionSelect).toHaveValue("");
  });

  it("calls onSubmit with correctly shaped data when targeting a parada", async () => {
    const { motivo, fechaInicio, paradaSelect, onSubmit } = renderForm();

    fireEvent.change(motivo, { target: { value: "Cierre por desfile" } });
    fireEvent.change(fechaInicio, { target: { value: "2026-04-01" } });
    fireEvent.change(paradaSelect, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      tipoAfectacion: "TEMPORAL",
      motivo: "Cierre por desfile",
      fechaInicio: "2026-04-01",
      fechaFin: undefined,
      idParada: "1",
      idEstacion: undefined,
      estadoAfectacion: "ACTIVA",
    });
  });

  it("calls onSubmit with correctly shaped data when targeting an estación", async () => {
    const { motivo, fechaInicio, estacionRadio, estacionSelect, onSubmit } = renderForm();

    fireEvent.change(motivo, { target: { value: "Mantenimiento de andén" } });
    fireEvent.change(fechaInicio, { target: { value: "2026-04-05" } });
    fireEvent.click(estacionRadio);
    fireEvent.change(estacionSelect, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      tipoAfectacion: "TEMPORAL",
      motivo: "Mantenimiento de andén",
      fechaInicio: "2026-04-05",
      fechaFin: undefined,
      idParada: undefined,
      idEstacion: "2",
      estadoAfectacion: "ACTIVA",
    });
  });

  it("defaults estadoAfectacion to 'ACTIVA', which matches an existing <option>", () => {
    const { estadoSelect } = renderForm();

    expect(estadoSelect).toHaveValue("ACTIVA");
  });
});
