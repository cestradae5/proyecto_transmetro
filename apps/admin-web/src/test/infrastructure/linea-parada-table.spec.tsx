import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LineaParadaTable } from "../../features/infrastructure/components/lineas/linea-parada-table";
import type { LineaParada } from "../../features/infrastructure/types/infrastructure.types";

function makeLineaParada(overrides: Partial<LineaParada>): LineaParada {
  return {
    idLineaParada: "1",
    orden: 1,
    minutosHastaSiguiente: 5,
    idParada: "10",
    idLinea: "1",
    parada: {
      idParada: 10,
      nombreParada: "Parada Uno",
      latitud: 14.0,
      longitud: -90.0,
      estadoParada: "ACTIVA" as any,
      fecha_creacion: "2026-01-01T00:00:00.000Z",
      fecha_actualizacion: "2026-01-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

const TWO_PARADAS: LineaParada[] = [
  makeLineaParada({ idLineaParada: "1", orden: 2, parada: { ...makeLineaParada({}).parada, nombreParada: "Segunda" } }),
  makeLineaParada({ idLineaParada: "2", orden: 1, parada: { ...makeLineaParada({}).parada, nombreParada: "Primera" } }),
];

const THREE_PARADAS: LineaParada[] = [
  ...TWO_PARADAS,
  makeLineaParada({ idLineaParada: "3", orden: 3, parada: { ...makeLineaParada({}).parada, nombreParada: "Tercera" } }),
];

function renderTable(props: Partial<Parameters<typeof LineaParadaTable>[0]> = {}) {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onRemove = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <LineaParadaTable
      lineaParadas={TWO_PARADAS}
      loading={false}
      onUpdate={onUpdate}
      onRemove={onRemove}
      {...props}
    />
  );
  return { ...utils, onUpdate, onRemove };
}

describe("LineaParadaTable", () => {
  it("shows loading state", () => {
    renderTable({ loading: true });
    expect(screen.getByText("Cargando paradas...")).toBeTruthy();
  });

  it("shows empty state when no paradas assigned", () => {
    renderTable({ lineaParadas: [] });
    expect(screen.getByText("No hay paradas asignadas")).toBeTruthy();
  });

  it("renders rows sorted by orden ascending", () => {
    renderTable();
    const rows = screen.getAllByRole("row").slice(1); // skip header row
    expect(rows[0]!.textContent).toContain("Primera");
    expect(rows[1]!.textContent).toContain("Segunda");
  });

  it("swaps a row into edit mode when Editar is clicked", () => {
    const { container } = renderTable();
    const editButtons = screen.getAllByText("Editar");
    fireEvent.click(editButtons[0]!);
    expect(container.querySelector("input[type='number']")).toBeTruthy();
    expect(screen.getByText("Guardar")).toBeTruthy();
    expect(screen.getByText("Cancelar")).toBeTruthy();
  });

  it("disables Eliminar for all rows when exactly 2 paradas remain", () => {
    renderTable({ lineaParadas: TWO_PARADAS });
    const removeButtons = screen.getAllByText("Eliminar") as HTMLButtonElement[];
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("enables Eliminar for all rows when 3 or more paradas remain", () => {
    renderTable({ lineaParadas: THREE_PARADAS });
    const removeButtons = screen.getAllByText("Eliminar") as HTMLButtonElement[];
    expect(removeButtons).toHaveLength(3);
    removeButtons.forEach((btn) => expect(btn).not.toBeDisabled());
  });
});
