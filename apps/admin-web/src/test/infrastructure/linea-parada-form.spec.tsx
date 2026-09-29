import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LineaParadaForm } from "../../features/infrastructure/components/lineas/linea-parada-form";
import type { LineaParada } from "../../features/infrastructure/types/infrastructure.types";

const SAMPLE: LineaParada = {
  idLineaParada: "100",
  orden: 1,
  minutosHastaSiguiente: 5,
  idParada: "5",
  idLinea: "1",
  parada: {
    idParada: 5,
    nombreParada: "Parada Central",
    latitud: 14.6349,
    longitud: -90.5069,
    estadoParada: "ACTIVA" as any,
    fecha_creacion: "2026-01-01T00:00:00.000Z",
    fecha_actualizacion: "2026-01-01T00:00:00.000Z",
  },
};

function renderForm(props: Partial<Parameters<typeof LineaParadaForm>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const utils = render(
    <LineaParadaForm lineaParada={SAMPLE} onSave={onSave} onCancel={onCancel} {...props} />
  );
  const inputs = utils.container.querySelectorAll("input[type='number']");
  const orden = inputs[0] as HTMLInputElement;
  const minutos = inputs[1] as HTMLInputElement;
  return { ...utils, onSave, onCancel, orden, minutos };
}

describe("LineaParadaForm", () => {
  it("pre-fills orden and minutos from lineaParada", () => {
    const { orden, minutos } = renderForm();
    expect(orden).toHaveValue(1);
    expect(minutos).toHaveValue(5);
  });

  it("calls onSave with parsed integers", async () => {
    const { onSave, orden, minutos } = renderForm();
    fireEvent.change(orden, { target: { value: "3" } });
    fireEvent.change(minutos, { target: { value: "7" } });
    fireEvent.click(screen.getByText("Guardar"));
    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ orden: 3, minutosHastaSiguiente: 7 });
    });
  });

  it("shows validation error for orden <= 0", async () => {
    const { orden } = renderForm();
    await act(async () => {
      fireEvent.change(orden, { target: { value: "0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Guardar"));
    });
    await waitFor(() => expect(screen.getByText("El orden debe ser un número mayor a 0")).toBeTruthy());
  });

  it("shows validation error for minutos < 0", async () => {
    const { minutos } = renderForm();
    await act(async () => {
      fireEvent.change(minutos, { target: { value: "-1" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Guardar"));
    });
    await waitFor(() => expect(screen.getByText("Los minutos deben ser un número mayor o igual a 0")).toBeTruthy());
  });

  it("calls onCancel without saving", () => {
    const { onCancel } = renderForm();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onCancel).toHaveBeenCalled();
  });
});
