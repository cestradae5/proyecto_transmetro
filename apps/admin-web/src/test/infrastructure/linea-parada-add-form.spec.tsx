import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LineaParadaAddForm } from "../../features/infrastructure/components/lineas/linea-parada-add-form";
import type { Parada } from "../../features/infrastructure/types/infrastructure.types";

const PARADAS: Parada[] = [
  {
    idParada: 1,
    nombreParada: "Parada A",
    latitud: 14.0,
    longitud: -90.0,
    estadoParada: "ACTIVA" as any,
    esEstacion: false,
    idEstacion: null,
    fecha_creacion: "2026-01-01T00:00:00.000Z",
    fecha_actualizacion: "2026-01-01T00:00:00.000Z",
  },
  {
    idParada: 2,
    nombreParada: "Parada B",
    latitud: 14.1,
    longitud: -90.1,
    estadoParada: "ACTIVA" as any,
    esEstacion: false,
    idEstacion: null,
    fecha_creacion: "2026-01-01T00:00:00.000Z",
    fecha_actualizacion: "2026-01-01T00:00:00.000Z",
  },
];

function renderForm(
  props: Partial<Parameters<typeof LineaParadaAddForm>[0]> = {}
) {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <LineaParadaAddForm availableParadas={PARADAS} onAdd={onAdd} {...props} />
  );
  const select = utils.container.querySelector("select") as HTMLSelectElement;
  const inputs = utils.container.querySelectorAll("input[type='number']");
  const orden = inputs[0] as HTMLInputElement;
  const minutos = inputs[1] as HTMLInputElement;
  return { ...utils, onAdd, select, orden, minutos };
}

describe("LineaParadaAddForm", () => {
  it("renders dropdown with available paradas", () => {
    const { select } = renderForm();
    expect(select.options.length).toBe(3); // placeholder + 2 paradas
    expect(select.options[1]!.textContent).toBe("Parada A");
    expect(select.options[2]!.textContent).toBe("Parada B");
  });

  it("calls onAdd with string idParada and parsed integers", async () => {
    const { onAdd, select, orden, minutos } = renderForm();
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.change(orden, { target: { value: "2" } });
    fireEvent.change(minutos, { target: { value: "4" } });
    fireEvent.click(screen.getByText("Agregar"));
    await vi.waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({
        idParada: "1",
        orden: 2,
        minutosHastaSiguiente: 4,
      });
    });
  });

  it("shows validation error when no parada selected", async () => {
    const { orden, minutos } = renderForm();
    await act(async () => {
      fireEvent.change(orden, { target: { value: "1" } });
      fireEvent.change(minutos, { target: { value: "0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Agregar"));
    });
    expect(screen.getByText("Seleccione una parada")).toBeTruthy();
  });

  it("shows validation error for invalid orden", async () => {
    const { select, orden, minutos } = renderForm();
    await act(async () => {
      fireEvent.change(select, { target: { value: "1" } });
      fireEvent.change(orden, { target: { value: "-1" } });
      fireEvent.change(minutos, { target: { value: "0" } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Agregar"));
    });
    expect(
      screen.getByText("El orden debe ser un número mayor a 0")
    ).toBeTruthy();
  });

  it("disables submit when no paradas available", () => {
    renderForm({ availableParadas: [] });
    expect(screen.getByText("Agregar")).toBeDisabled();
    expect(
      screen.getByText("No hay paradas disponibles para asignar.")
    ).toBeTruthy();
  });
});
