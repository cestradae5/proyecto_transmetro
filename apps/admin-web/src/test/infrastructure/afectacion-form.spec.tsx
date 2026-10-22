import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AfectacionForm } from "../../features/infrastructure/components/afectaciones/afectacion-form";
import type {
  Afectacion,
  Estacion,
  Linea,
  Municipalidad,
  Parada,
} from "../../features/infrastructure/types/infrastructure.types";

const MUNICIPALIDADES: Municipalidad[] = [
  {
    idMunicipalidad: "4",
    nombreMunicipalidad: "Villa Nueva",
    departamento: "Guatemala",
    estadoMunicipalidad: "ACTIVA" as Municipalidad["estadoMunicipalidad"],
  },
];

const LINEAS: Linea[] = [
  {
    idLinea: "7",
    numeroLinea: "L1",
    nombreLinea: "Roosevelt",
    colorHex: "#ff0000",
    tipoRecorrido: "LINEAL" as Linea["tipoRecorrido"],
    idParqueo: null,
    estadoLinea: "ACTIVA" as Linea["estadoLinea"],
  },
];

const PARADAS: Parada[] = [
  {
    idParada: 1,
    nombreParada: "Parada A",
    latitud: 14.6,
    longitud: -90.5,
    estadoParada: "CERRADA" as Parada["estadoParada"],
    esEstacion: false,
    idEstacion: null,
  },
];

const ESTACIONES: Estacion[] = [
  {
    idEstacion: 2,
    nombreEstacion: "Estación B",
    latitud: 14.61,
    longitud: -90.51,
    idParada: 3,
    estadoEstacion: "ACTIVA" as Estacion["estadoEstacion"],
  },
];

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined), afectacion?: Afectacion) {
  const onCancel = vi.fn();
  render(
    <AfectacionForm
      municipalidades={MUNICIPALIDADES}
      lineas={LINEAS}
      paradas={PARADAS}
      estaciones={ESTACIONES}
      afectacion={afectacion}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel };
}

const tipoSelect = () => screen.getByLabelText("Afecta a *") as HTMLSelectElement;
const motivo = () => screen.getByLabelText("Motivo *") as HTMLTextAreaElement;
const fechaInicio = () => screen.getByLabelText("Fecha inicio *") as HTMLInputElement;
const fechaFin = () => screen.getByLabelText("Fecha fin") as HTMLInputElement;
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

function fillCommon(values: { motivo?: string; fechaInicio?: string; fechaFin?: string }) {
  if (values.motivo !== undefined) fireEvent.change(motivo(), { target: { value: values.motivo } });
  if (values.fechaInicio !== undefined) fireEvent.change(fechaInicio(), { target: { value: values.fechaInicio } });
  if (values.fechaFin !== undefined) fireEvent.change(fechaFin(), { target: { value: values.fechaFin } });
}

describe("AfectacionForm", () => {
  it("renders only the action, target, motivo and date fields, defaulting to Desactivar", () => {
    renderForm();

    expect(screen.getByRole("radio", { name: "Desactivar" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Activar" })).not.toBeChecked();
    expect(tipoSelect()).toHaveValue("linea");
    expect(screen.getByLabelText("Línea *")).toHaveValue("");
    expect(motivo()).toHaveValue("");
    expect(fechaInicio()).toHaveValue("");
    expect(fechaFin()).toHaveValue("");
    expect(screen.getByText("Solo informativa: la afectación no se revierte automáticamente.")).toBeInTheDocument();
    // The old tipo/estado selectors are gone.
    expect(screen.queryByText(/TEMPORAL|PERMANENTE|PENDIENTE/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Estado/)).not.toBeInTheDocument();
  });

  it("requires motivo, fecha inicio and a target", async () => {
    const { onSubmit } = renderForm();

    submit();

    expect(await screen.findByText("El motivo es requerido")).toBeInTheDocument();
    expect(screen.getByText("La fecha de inicio es requerida")).toBeInTheDocument();
    expect(screen.getByText("Seleccione la municipalidad, línea, parada o estación afectada")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("treats a blank motivo as missing", async () => {
    const { onSubmit } = renderForm();

    fillCommon({ motivo: "   ", fechaInicio: "2026-03-01" });
    fireEvent.change(screen.getByLabelText("Línea *"), { target: { value: "7" } });
    submit();

    expect(await screen.findByText("El motivo es requerido")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a fecha fin before fecha inicio but accepts the same day", async () => {
    const { onSubmit } = renderForm();

    fillCommon({ motivo: "Obra", fechaInicio: "2026-03-10", fechaFin: "2026-03-09" });
    fireEvent.change(screen.getByLabelText("Línea *"), { target: { value: "7" } });
    submit();

    expect(await screen.findByText("La fecha de fin no puede ser anterior a la fecha de inicio")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fillCommon({ fechaFin: "2026-03-10" });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("La fecha de fin no puede ser anterior a la fecha de inicio")).not.toBeInTheDocument();
  });

  it("swaps the record list when the target type changes and clears the selection", () => {
    renderForm();

    const lineaSelect = screen.getByLabelText("Línea *");
    expect(screen.getByRole("option", { name: "L1 - Roosevelt (ACTIVA)" })).toBeInTheDocument();
    fireEvent.change(lineaSelect, { target: { value: "7" } });
    expect(lineaSelect).toHaveValue("7");

    fireEvent.change(tipoSelect(), { target: { value: "parada" } });
    expect(screen.queryByLabelText("Línea *")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Parada *")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Parada A (CERRADA)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "L1 - Roosevelt (ACTIVA)" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Parada *"), { target: { value: "1" } });
    fireEvent.change(tipoSelect(), { target: { value: "estacion" } });
    expect(screen.getByLabelText("Estación *")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Estación B (ACTIVA)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Parada A (CERRADA)" })).not.toBeInTheDocument();
  });

  it("submits a línea deactivation with only idLinea and no fechaFin", async () => {
    const { onSubmit } = renderForm();

    fillCommon({ motivo: "  Cierre por desfile ", fechaInicio: "2026-04-01" });
    fireEvent.change(screen.getByLabelText("Línea *"), { target: { value: "7" } });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({
      accion: "DESACTIVAR",
      motivo: "Cierre por desfile",
      fechaInicio: "2026-04-01",
      idLinea: "7",
    });
  });

  it("submits a parada activation with fechaFin and only idParada", async () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "Activar" }));
    fireEvent.change(tipoSelect(), { target: { value: "parada" } });
    fireEvent.change(screen.getByLabelText("Parada *"), { target: { value: "1" } });
    fillCommon({ motivo: "Reapertura", fechaInicio: "2026-04-05", fechaFin: "2026-04-06" });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({
      accion: "ACTIVAR",
      motivo: "Reapertura",
      fechaInicio: "2026-04-05",
      fechaFin: "2026-04-06",
      idParada: "1",
    });
  });

  it("submits an estación deactivation with only idEstacion", async () => {
    const { onSubmit } = renderForm();

    fireEvent.change(tipoSelect(), { target: { value: "estacion" } });
    fireEvent.change(screen.getByLabelText("Estación *"), { target: { value: "2" } });
    fillCommon({ motivo: "Mantenimiento de andén", fechaInicio: "2026-04-05" });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({
      accion: "DESACTIVAR",
      motivo: "Mantenimiento de andén",
      fechaInicio: "2026-04-05",
      idEstacion: "2",
    });
  });

  it("shows the server message when saving fails and keeps the values", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("La línea ya está inactiva"));
    renderForm(onSubmit);

    fillCommon({ motivo: "Obra", fechaInicio: "2026-04-01" });
    fireEvent.change(screen.getByLabelText("Línea *"), { target: { value: "7" } });
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("La línea ya está inactiva");
    expect(motivo()).toHaveValue("Obra");
    expect(screen.getByRole("button", { name: "Guardar" })).not.toBeDisabled();
  });

  it("offers Municipalidad as a target, showing its current estado, and submits only idMunicipalidad", async () => {
    const { onSubmit } = renderForm();

    expect(within(tipoSelect()).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Municipalidad",
      "Línea",
      "Parada",
      "Estación",
    ]);
    fireEvent.change(tipoSelect(), { target: { value: "municipalidad" } });
    expect(screen.getByLabelText("Municipalidad *")).toHaveValue("");
    expect(screen.getByRole("option", { name: "Villa Nueva (ACTIVA)" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Municipalidad *"), { target: { value: "4" } });
    fillCommon({ motivo: "Cierre municipal", fechaInicio: "2026-05-01" });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({
      accion: "DESACTIVAR",
      motivo: "Cierre municipal",
      fechaInicio: "2026-05-01",
      idMunicipalidad: "4",
    });
  });

  it("calls onCancel from Cancelar", () => {
    const { onCancel, onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

const EXISTING: Afectacion = {
  idAfectacion: "12",
  accion: "DESACTIVAR",
  motivo: "Cierre municipal",
  fechaInicio: "2026-05-01",
  fechaFin: "2026-05-10",
  idMunicipalidad: "4",
  idLinea: null,
  idParada: null,
  idEstacion: null,
  cambios: [],
};

describe("AfectacionForm edit mode", () => {
  it("prefills every field and shows the target fixed (disabled)", () => {
    renderForm(undefined, EXISTING);

    expect(screen.getByRole("radio", { name: "Desactivar" })).toBeChecked();
    expect(tipoSelect()).toHaveValue("municipalidad");
    expect(tipoSelect()).toBeDisabled();
    expect(screen.getByLabelText("Municipalidad *")).toHaveValue("4");
    expect(screen.getByLabelText("Municipalidad *")).toBeDisabled();
    expect(motivo()).toHaveValue("Cierre municipal");
    expect(fechaInicio()).toHaveValue("2026-05-01");
    expect(fechaFin()).toHaveValue("2026-05-10");
    expect(screen.getByRole("radio", { name: "Activar" })).not.toBeDisabled();
    expect(motivo()).not.toBeDisabled();
  });

  it("submits only the changed acción", async () => {
    const { onSubmit } = renderForm(undefined, EXISTING);

    fireEvent.click(screen.getByRole("radio", { name: "Activar" }));
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({ accion: "ACTIVAR" });
  });

  it("submits changed motivo and fechas, sending null when fecha fin is cleared", async () => {
    const { onSubmit } = renderForm(undefined, EXISTING);

    fillCommon({ motivo: " Cierre por obras ", fechaInicio: "2026-05-02", fechaFin: "" });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({
      motivo: "Cierre por obras",
      fechaInicio: "2026-05-02",
      fechaFin: null,
    });
  });

  it("does not submit when nothing changed", async () => {
    const { onSubmit } = renderForm(undefined, EXISTING);

    submit();

    expect(await screen.findByText("No hay cambios para guardar")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("prefills a línea target and a legacy datetime fecha inicio without counting it as a change", async () => {
    const { onSubmit } = renderForm(undefined, {
      ...EXISTING,
      accion: "TEMPORAL",
      fechaInicio: "2026-01-10T00:00:00.000Z",
      fechaFin: null,
      idMunicipalidad: null,
      idLinea: "7",
    });

    expect(tipoSelect()).toHaveValue("linea");
    expect(screen.getByLabelText("Línea *")).toHaveValue("7");
    expect(screen.getByRole("radio", { name: "Desactivar" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Activar" })).not.toBeChecked();
    expect(fechaInicio()).toHaveValue("2026-01-10");

    fillCommon({ motivo: "Dato corregido" });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toStrictEqual({ motivo: "Dato corregido" });
  });

  it("shows a 409 server message and keeps the edited values", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error("Solo la afectación más reciente de este objetivo puede cambiar de acción"));
    renderForm(onSubmit, EXISTING);

    fireEvent.click(screen.getByRole("radio", { name: "Activar" }));
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Solo la afectación más reciente de este objetivo puede cambiar de acción",
    );
    expect(screen.getByRole("radio", { name: "Activar" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar" })).not.toBeDisabled();
  });
});
