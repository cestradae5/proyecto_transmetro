import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LineaForm } from "../../features/infrastructure/components/lineas/linea-form";
import type { Linea, Parqueo } from "../../features/infrastructure/types/infrastructure.types";

// Same caveat as parada-form.spec.tsx: labels are not associated via
// htmlFor/id, so fields are queried by type/order instead of getByLabelText.

const SAMPLE_PARQUEOS: Parqueo[] = [
  {
    idParqueo: "9",
    nombreParqueo: "Parqueo Central",
    tipoParqueo: "CENTRAL" as Parqueo["tipoParqueo"],
    direccion: "Zona 1",
    latitud: 14.6,
    longitud: -90.5,
    capacidadUnidades: 20,
    estadoParqueo: "ACTIVO" as Parqueo["estadoParqueo"],
  },
];

const SAMPLE_LINEA: Linea = {
  idLinea: "4",
  numeroLinea: "L1",
  nombreLinea: "Línea Norte-Sur",
  colorHex: "#00A651",
  tipoRecorrido: "CIRCULAR" as Linea["tipoRecorrido"],
  idParqueo: "9",
  estadoLinea: "INACTIVA" as Linea["estadoLinea"],
};

function renderForm(props: Partial<Parameters<typeof LineaForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(
    <LineaForm parqueos={SAMPLE_PARQUEOS} onSubmit={onSubmit} onCancel={onCancel} {...props} />,
  );
  const texts = utils.container.querySelectorAll("input[type='text']");
  const numero = texts[0] as HTMLInputElement;
  const nombreLinea = texts[1] as HTMLInputElement;
  const colorHex = texts[2] as HTMLInputElement;
  const selects = utils.container.querySelectorAll("select");
  const tipoRecorridoSelect = selects[0] as HTMLSelectElement;
  const parqueoSelect = selects[1] as HTMLSelectElement;
  const estadoSelect = selects[2] as HTMLSelectElement;
  return {
    ...utils,
    onSubmit,
    onCancel,
    numero,
    nombreLinea,
    colorHex,
    tipoRecorridoSelect,
    parqueoSelect,
    estadoSelect,
  };
}

describe("LineaForm", () => {
  it("renders empty fields with defaults in create mode", () => {
    const { numero, nombreLinea, colorHex, tipoRecorridoSelect, parqueoSelect, estadoSelect } = renderForm();

    expect(numero).toHaveValue("");
    expect(nombreLinea).toHaveValue("");
    expect(colorHex).toHaveValue("#FF0000");
    expect(tipoRecorridoSelect).toHaveValue("LINEAL");
    expect(parqueoSelect).toHaveValue("");
    expect(estadoSelect).toHaveValue("ACTIVA");
  });

  it("renders pre-filled fields in edit mode", () => {
    const { numero, nombreLinea, colorHex, tipoRecorridoSelect, parqueoSelect, estadoSelect } = renderForm({
      linea: SAMPLE_LINEA,
    });

    expect(numero).toHaveValue("L1");
    expect(nombreLinea).toHaveValue("Línea Norte-Sur");
    expect(colorHex).toHaveValue("#00A651");
    expect(tipoRecorridoSelect).toHaveValue("CIRCULAR");
    expect(parqueoSelect).toHaveValue("9");
    expect(estadoSelect).toHaveValue("INACTIVA");
  });

  it("shows validation errors for empty required fields and invalid hex color", async () => {
    const { colorHex, onSubmit } = renderForm();

    fireEvent.change(colorHex, { target: { value: "not-a-color" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El número de línea es requerido")).toBeInTheDocument();
    expect(screen.getByText("El nombre es requerido")).toBeInTheDocument();
    expect(screen.getByText("Color debe ser formato hex válido de 6 dígitos (ej: #FF0000)")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("offers 'Sin parqueo' as the default parqueo option", () => {
    const { parqueoSelect } = renderForm();

    const first = within(parqueoSelect).getAllByRole("option")[0] as HTMLOptionElement;
    expect(first.value).toBe("");
    expect(first.textContent).toBe("Sin parqueo");
  });

  it("submits a línea without parqueo as idParqueo null", async () => {
    const { numero, nombreLinea, onSubmit } = renderForm();

    fireEvent.change(numero, { target: { value: "L2" } });
    fireEvent.change(nombreLinea, { target: { value: "Línea Este-Oeste" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("El parqueo es requerido")).not.toBeInTheDocument();
    expect(onSubmit.mock.calls[0]?.[0].idParqueo).toBeNull();
  });

  it("clears the parqueo of an existing línea when 'Sin parqueo' is chosen", async () => {
    const { parqueoSelect, onSubmit } = renderForm({ linea: SAMPLE_LINEA });

    fireEvent.change(parqueoSelect, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0].idParqueo).toBeNull();
  });

  it("renders 'Sin parqueo' selected when editing a línea without parqueo", () => {
    const { parqueoSelect } = renderForm({ linea: { ...SAMPLE_LINEA, idParqueo: null } });

    expect(parqueoSelect).toHaveValue("");
  });

  it("calls onSubmit with correctly shaped data on success", async () => {
    const { numero, nombreLinea, parqueoSelect, onSubmit } = renderForm();

    fireEvent.change(numero, { target: { value: "L2" } });
    fireEvent.change(nombreLinea, { target: { value: "Línea Este-Oeste" } });
    fireEvent.change(parqueoSelect, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      numeroLinea: "L2",
      nombreLinea: "Línea Este-Oeste",
      colorHex: "#FF0000",
      tipoRecorrido: "LINEAL",
      idParqueo: "9",
      estadoLinea: "ACTIVA",
    });
  });

  // Regression test for the PR#3 bug: EstadoLinea/TipoRecorrido enums were
  // ACTIVA/CERRADA/MANTENIMIENTO and IDA_VUELTA/DIRECTO in earlier code, but
  // tbl_linea's DB CHECK constraint only allows ACTIVA/INACTIVA and
  // CIRCULAR/LINEAL (database/init.sql:215-216). Submitting the wrong values
  // would fail the CHECK constraint against a real database. This test
  // would have caught that bug before it reached the DB layer.
  it("only offers ACTIVA/INACTIVA and CIRCULAR/LINEAL as select options (regression: DB CHECK constraint)", () => {
    const { tipoRecorridoSelect, estadoSelect } = renderForm();

    const tipoOptions = within(tipoRecorridoSelect)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(tipoOptions.sort()).toEqual(["CIRCULAR", "LINEAL"]);

    const estadoOptions = within(estadoSelect)
      .getAllByRole("option")
      .map((option) => (option as HTMLOptionElement).value);
    expect(estadoOptions.sort()).toEqual(["ACTIVA", "INACTIVA"]);
  });
});
