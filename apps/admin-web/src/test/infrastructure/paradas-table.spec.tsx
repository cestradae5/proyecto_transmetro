import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ParadasTable } from "../../features/infrastructure/components/paradas/paradas-table";
import type { Estacion, Linea, Parada } from "../../features/infrastructure/types/infrastructure.types";

// The station-lines dialog belongs to fleet and has its own spec; stub it so
// this test only checks that the paradas table opens it for the right estación.
vi.mock("../../features/infrastructure/components/estacion-lineas/estacion-lineas-dialog", () => ({
  EstacionLineasDialog: ({ stationId, stationName }: { stationId: string; stationName: string }) => (
    <div role="dialog" aria-label="Líneas de la estación">{`${stationId}:${stationName}`}</div>
  ),
}));

// The accesos dialog has its own spec (accesos-dialog.spec.tsx).
vi.mock("../../features/infrastructure/components/paradas/accesos-dialog", () => ({
  AccesosDialog: ({ parada }: { parada: { idParada: number; nombreParada: string } }) => (
    <div role="dialog" aria-label="Accesos de la parada">{`${parada.idParada}:${parada.nombreParada}`}</div>
  ),
}));

const PARADAS: Parada[] = [
  {
    idParada: 1,
    nombreParada: "Parada Simple",
    latitud: 14.6,
    longitud: -90.5,
    estadoParada: "ACTIVA" as Parada["estadoParada"],
    esEstacion: false,
    idEstacion: null,
  },
  {
    idParada: 2,
    nombreParada: "Parada Central",
    latitud: 14.61,
    longitud: -90.51,
    estadoParada: "ACTIVA" as Parada["estadoParada"],
    esEstacion: true,
    idEstacion: "12",
  },
];

const ESTACIONES: Estacion[] = [
  {
    idEstacion: 12,
    nombreEstacion: "Estación Central",
    latitud: 14.61,
    longitud: -90.51,
    idParada: 2,
    estadoEstacion: "ACTIVA" as Estacion["estadoEstacion"],
  },
];

const LINEAS: Linea[] = [];

function renderTable() {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <ParadasTable paradas={PARADAS} estaciones={ESTACIONES} lineas={LINEAS} onSave={onSave} onDelete={onDelete} />,
  );
  return { ...utils, onSave, onDelete };
}

function rowOf(nombre: string) {
  return screen.getByText(nombre).closest("tr") as HTMLElement;
}

describe("ParadasTable", () => {
  it("shows the Estación badge only for paradas that are estaciones", () => {
    renderTable();

    expect(within(rowOf("Parada Central")).getByText("Estación")).toBeInTheDocument();
    expect(within(rowOf("Parada Simple")).queryByText("Estación")).not.toBeInTheDocument();
  });

  it("offers the station lines action only for estaciones and opens it for the right estación", () => {
    renderTable();

    expect(
      within(rowOf("Parada Simple")).queryByRole("button", { name: "Líneas de la estación" }),
    ).not.toBeInTheDocument();

    fireEvent.click(within(rowOf("Parada Central")).getByRole("button", { name: "Líneas de la estación" }));

    expect(screen.getByRole("dialog", { name: "Líneas de la estación" })).toHaveTextContent("12:Estación Central");
  });

  it("offers the Accesos action on every parada and opens it for the right parada", () => {
    renderTable();

    expect(within(rowOf("Parada Central")).getByRole("button", { name: "Accesos" })).toBeInTheDocument();

    fireEvent.click(within(rowOf("Parada Simple")).getByRole("button", { name: "Accesos" }));

    expect(screen.getByRole("dialog", { name: "Accesos de la parada" })).toHaveTextContent("1:Parada Simple");
  });

  it("opens the edit dialog with the linked estación pre-filled and saves through onSave", async () => {
    const { onSave } = renderTable();

    fireEvent.click(within(rowOf("Parada Central")).getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Es estación")).toBeChecked();
    expect(screen.getByLabelText("Nombre de la estación")).toHaveValue("Estación Central");

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toBe(2);
    expect(onSave.mock.calls[0]?.[1]).toMatchObject({
      estacion: { nombreEstacion: "Estación Central" },
      idEstacion: "12",
    });
  });
});
