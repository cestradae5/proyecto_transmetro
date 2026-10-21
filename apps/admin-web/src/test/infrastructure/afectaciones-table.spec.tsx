import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AfectacionesTable } from "../../features/infrastructure/components/afectaciones/afectaciones-table";
import type { Afectacion, Estacion, Linea, Parada } from "../../features/infrastructure/types/infrastructure.types";

const LINEAS: Linea[] = [
  {
    idLinea: "7",
    numeroLinea: "L1",
    nombreLinea: "Roosevelt",
    colorHex: "#ff0000",
    tipoRecorrido: "LINEAL" as Linea["tipoRecorrido"],
    idParqueo: null,
    estadoLinea: "INACTIVA" as Linea["estadoLinea"],
  },
];

const PARADAS: Parada[] = [
  {
    idParada: 1,
    nombreParada: "Parada A",
    latitud: 14.6,
    longitud: -90.5,
    estadoParada: "ACTIVA" as Parada["estadoParada"],
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
    estadoEstacion: "CERRADA" as Estacion["estadoEstacion"],
  },
];

const base = { fechaFin: null, idLinea: null, idParada: null, idEstacion: null };

const AFECTACIONES: Afectacion[] = [
  { ...base, idAfectacion: "4", accion: "DESACTIVAR", motivo: "Desfile", fechaInicio: "2026-04-01", fechaFin: "2026-04-02", idLinea: "7" },
  { ...base, idAfectacion: "3", accion: "ACTIVAR", motivo: "Reapertura", fechaInicio: "2026-03-15", idParada: "1" },
  { ...base, idAfectacion: "2", accion: "DESACTIVAR", motivo: "Andén dañado", fechaInicio: "2026-03-01", idEstacion: "2" },
  { ...base, idAfectacion: "1", accion: "TEMPORAL", motivo: "Dato antiguo", fechaInicio: "2026-01-10T00:00:00.000Z", idParada: "99" },
];

function renderTable(afectaciones = AFECTACIONES) {
  return render(
    <AfectacionesTable afectaciones={afectaciones} lineas={LINEAS} paradas={PARADAS} estaciones={ESTACIONES} />,
  );
}

const rowOf = (motivo: string) => screen.getByText(motivo).closest("tr") as HTMLTableRowElement;

describe("AfectacionesTable", () => {
  it("shows the history columns", () => {
    renderTable();

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Fecha inicio", "Fecha fin", "Acción", "Afecta a", "Motivo"]);
  });

  it("renders the action badge, resolved target and dates of each row", () => {
    renderTable();

    const linea = within(rowOf("Desfile"));
    expect(linea.getByText("Desactivar")).toBeInTheDocument();
    expect(linea.getByText("Línea: L1 - Roosevelt")).toBeInTheDocument();
    expect(linea.getByText("01/04/2026")).toBeInTheDocument();
    expect(linea.getByText("02/04/2026")).toBeInTheDocument();

    const parada = within(rowOf("Reapertura"));
    expect(parada.getByText("Activar")).toBeInTheDocument();
    expect(parada.getByText("Parada: Parada A")).toBeInTheDocument();
    expect(parada.getByText("—")).toBeInTheDocument();

    expect(within(rowOf("Andén dañado")).getByText("Estación: Estación B")).toBeInTheDocument();
  });

  it("shows legacy actions as-is and falls back to #id for unknown targets", () => {
    renderTable();

    const legacy = within(rowOf("Dato antiguo"));
    expect(legacy.getByText("TEMPORAL")).toBeInTheDocument();
    expect(legacy.getByText("Parada: #99")).toBeInTheDocument();
    expect(legacy.getByText("10/01/2026")).toBeInTheDocument();
  });

  it("is read-only: no Editar or Eliminar actions", () => {
    renderTable();

    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it("filters rows by motivo", () => {
    renderTable();

    fireEvent.change(screen.getByPlaceholderText("Buscar por motivo..."), { target: { value: "reaper" } });

    expect(screen.getByText("Reapertura")).toBeInTheDocument();
    expect(screen.queryByText("Desfile")).not.toBeInTheDocument();
    expect(screen.queryByText("Andén dañado")).not.toBeInTheDocument();
  });

  it("shows an empty message when there is no history", () => {
    renderTable([]);

    expect(screen.getByText("No hay afectaciones registradas.")).toBeInTheDocument();
  });
});
