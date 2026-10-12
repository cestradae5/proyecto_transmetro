import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { ParadaForm } from "../../features/infrastructure/components/paradas/parada-form";
import { ApiError } from "../../lib/api-client";
import type { Estacion, Parada } from "../../features/infrastructure/types/infrastructure.types";

// The parada's own <label> elements are not programmatically associated with
// their inputs (no htmlFor/id), so getByLabelText cannot resolve them. Query
// by input type/order instead, matching the DOM order in parada-form.tsx.
// The estación fields (rendered after the parada fields) carry aria-labels.

const SAMPLE_PARADA: Parada = {
  idParada: 7,
  nombreParada: "Parada Central",
  latitud: 14.6349,
  longitud: -90.5069,
  estadoParada: "ACTIVA" as Parada["estadoParada"],
  esEstacion: false,
  idEstacion: null,
  fecha_creacion: "2026-01-01T00:00:00.000Z",
  fecha_actualizacion: "2026-01-01T00:00:00.000Z",
};

const PARADA_ESTACION: Parada = { ...SAMPLE_PARADA, esEstacion: true, idEstacion: "12" };

const SAMPLE_ESTACION: Estacion = {
  idEstacion: 12,
  nombreEstacion: "Estación Central",
  latitud: 14.635,
  longitud: -90.507,
  idParada: 7,
  estadoEstacion: "MANTENIMIENTO" as Estacion["estadoEstacion"],
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
  const toggle = screen.getByLabelText("Es estación") as HTMLInputElement;
  return { ...utils, onSubmit, onCancel, nombre, latitud, longitud, estado, toggle };
}

function fillParada(nombre: HTMLInputElement, latitud: HTMLInputElement, longitud: HTMLInputElement) {
  fireEvent.change(nombre, { target: { value: "Parada Nueva" } });
  fireEvent.change(latitud, { target: { value: "14.5" } });
  fireEvent.change(longitud, { target: { value: "-90.3" } });
}

describe("ParadaForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty fields in create mode with the estación toggle off", () => {
    const { nombre, latitud, longitud, estado, toggle } = renderForm();

    expect(nombre).toHaveValue("");
    expect(latitud).toHaveValue(null);
    expect(longitud).toHaveValue(null);
    expect(estado).toHaveValue("ACTIVA");
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText("Nombre de la estación")).not.toBeInTheDocument();
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

  it("calls onSubmit with the parada and no estación when the toggle is off", async () => {
    const { nombre, latitud, longitud, estado, onSubmit } = renderForm();

    fillParada(nombre, latitud, longitud);
    fireEvent.change(estado, { target: { value: "MANTENIMIENTO" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      parada: {
        nombreParada: "Parada Nueva",
        latitud: 14.5,
        longitud: -90.3,
        estadoParada: "MANTENIMIENTO",
      },
      estacion: null,
      idEstacion: null,
    });
  });

  it("calls onCancel when the cancel button is clicked", () => {
    const { onCancel } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  describe("Es estación toggle", () => {
    it("shows the estación fields when turned on", () => {
      const { toggle } = renderForm();

      fireEvent.click(toggle);

      expect(toggle).toBeChecked();
      expect(screen.getByLabelText("Nombre de la estación")).toHaveValue("");
      expect(screen.getByLabelText("Estado de la estación")).toHaveValue("ACTIVA");
    });

    it("requires the estación name when the toggle is on", async () => {
      const { nombre, latitud, longitud, toggle, onSubmit } = renderForm();

      fillParada(nombre, latitud, longitud);
      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      expect(await screen.findByText("El nombre de la estación es requerido")).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("submits a new estación using the parada coordinates when its own are blank", async () => {
      const { nombre, latitud, longitud, toggle, onSubmit } = renderForm();

      fillParada(nombre, latitud, longitud);
      fireEvent.click(toggle);
      fireEvent.change(screen.getByLabelText("Nombre de la estación"), { target: { value: "Estación Nueva" } });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({
        parada: expect.objectContaining({ nombreParada: "Parada Nueva" }),
        estacion: {
          nombreEstacion: "Estación Nueva",
          latitud: 14.5,
          longitud: -90.3,
          estadoEstacion: "ACTIVA",
        },
        idEstacion: null,
      });
    });

    it("submits explicit estación coordinates when provided", async () => {
      const { nombre, latitud, longitud, toggle, onSubmit } = renderForm();

      fillParada(nombre, latitud, longitud);
      fireEvent.click(toggle);
      fireEvent.change(screen.getByLabelText("Nombre de la estación"), { target: { value: "Estación Nueva" } });
      fireEvent.change(screen.getByLabelText("Latitud de la estación"), { target: { value: "14.7" } });
      fireEvent.change(screen.getByLabelText("Longitud de la estación"), { target: { value: "-90.4" } });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0]?.[0].estacion).toMatchObject({ latitud: 14.7, longitud: -90.4 });
    });

    it("pre-fills the existing estación and sends its id on edit", async () => {
      const { toggle, onSubmit } = renderForm({ parada: PARADA_ESTACION, estacion: SAMPLE_ESTACION });

      expect(toggle).toBeChecked();
      expect(screen.getByLabelText("Nombre de la estación")).toHaveValue("Estación Central");
      expect(screen.getByLabelText("Estado de la estación")).toHaveValue("MANTENIMIENTO");
      expect(screen.getByLabelText("Latitud de la estación")).toHaveValue(14.635);

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
        estacion: { nombreEstacion: "Estación Central", estadoEstacion: "MANTENIMIENTO" },
        idEstacion: "12",
      });
    });

    it("keeps the existing estación when the removal is not confirmed", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { toggle } = renderForm({ parada: PARADA_ESTACION, estacion: SAMPLE_ESTACION });

      fireEvent.click(toggle);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(toggle).toBeChecked();
      expect(screen.getByLabelText("Nombre de la estación")).toBeInTheDocument();
    });

    it("asks for confirmation and submits the removal of an existing estación", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { toggle, onSubmit } = renderForm({ parada: PARADA_ESTACION, estacion: SAMPLE_ESTACION });

      fireEvent.click(toggle);
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(toggle).not.toBeChecked();

      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ estacion: null, idEstacion: "12" });
    });

    it("does not ask for confirmation when turning off a not-yet-saved estación", () => {
      const confirmSpy = vi.spyOn(window, "confirm");
      const { toggle } = renderForm();

      fireEvent.click(toggle);
      fireEvent.click(toggle);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(toggle).not.toBeChecked();
    });

    it("shows the in-use message and keeps the toggle on when the API answers 409 ESTACION_IN_USE", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const onSubmit = vi.fn().mockRejectedValue(
        new ApiError(409, "No se puede eliminar la estación 12 porque tiene asignaciones o vínculos", {
          statusCode: 409,
          error: "ESTACION_IN_USE",
        }),
      );
      const { toggle } = renderForm({ parada: PARADA_ESTACION, estacion: SAMPLE_ESTACION, onSubmit });

      fireEvent.click(toggle);
      expect(toggle).not.toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      expect(
        await screen.findByText("No se puede quitar la estación porque tiene asignaciones o vínculos"),
      ).toBeInTheDocument();
      expect(toggle).toBeChecked();
      expect(screen.getByLabelText("Nombre de la estación")).toHaveValue("Estación Central");
    });

    it("shows other save errors without forcing the toggle back on", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const onSubmit = vi.fn().mockRejectedValue(new ApiError(500, "Error interno", {}));
      const { toggle } = renderForm({ parada: PARADA_ESTACION, estacion: SAMPLE_ESTACION, onSubmit });

      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

      expect(await screen.findByText("Error interno")).toBeInTheDocument();
      expect(toggle).not.toBeChecked();
    });
  });
});
