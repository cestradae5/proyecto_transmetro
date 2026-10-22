import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AfectacionesTable } from "../../features/infrastructure/components/afectaciones/afectaciones-table";
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
    estadoMunicipalidad: "INACTIVA" as Municipalidad["estadoMunicipalidad"],
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

const base = { fechaFin: null, idMunicipalidad: null, idLinea: null, idParada: null, idEstacion: null, cambios: [] };

const AFECTACIONES: Afectacion[] = [
  { ...base, idAfectacion: "4", accion: "DESACTIVAR", motivo: "Desfile", fechaInicio: "2026-04-01", fechaFin: "2026-04-02", idLinea: "7" },
  { ...base, idAfectacion: "3", accion: "ACTIVAR", motivo: "Reapertura", fechaInicio: "2026-03-15", idParada: "1" },
  { ...base, idAfectacion: "2", accion: "DESACTIVAR", motivo: "Andén dañado", fechaInicio: "2026-03-01", idEstacion: "2" },
  { ...base, idAfectacion: "1", accion: "TEMPORAL", motivo: "Dato antiguo", fechaInicio: "2026-01-10T00:00:00.000Z", idParada: "99" },
];

function renderTable(afectaciones = AFECTACIONES, onEdit = vi.fn()) {
  render(
    <AfectacionesTable
      afectaciones={afectaciones}
      municipalidades={MUNICIPALIDADES}
      lineas={LINEAS}
      paradas={PARADAS}
      estaciones={ESTACIONES}
      onEdit={onEdit}
    />,
  );
  return { onEdit };
}

const CASCADE: Afectacion = {
  ...base,
  idAfectacion: "9",
  accion: "DESACTIVAR",
  motivo: "Cierre municipal",
  fechaInicio: "2026-05-01",
  idMunicipalidad: "4",
  cambios: [
    { entidadTipo: "municipalidad", entidadId: "4", estadoAnterior: "ACTIVA", estadoNuevo: "INACTIVA", revertido: false },
    { entidadTipo: "linea", entidadId: "7", estadoAnterior: "ACTIVA", estadoNuevo: "INACTIVA", revertido: false },
    { entidadTipo: "parada", entidadId: "1", estadoAnterior: "ACTIVA", estadoNuevo: "CERRADA", revertido: true },
    { entidadTipo: "estacion", entidadId: "2", estadoAnterior: "ACTIVA", estadoNuevo: "CERRADA", revertido: false },
  ],
};

const rowOf = (motivo: string) => screen.getByText(motivo).closest("tr") as HTMLTableRowElement;

describe("AfectacionesTable", () => {
  it("shows the history columns", () => {
    renderTable();

    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Fecha inicio", "Fecha fin", "Acción", "Afecta a", "Motivo", "Acciones"]);
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

  it("offers Editar on every row and no Eliminar", () => {
    const { onEdit } = renderTable();

    expect(screen.getAllByRole("button", { name: /^Editar/ })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Eliminar/ })).not.toBeInTheDocument();

    fireEvent.click(within(rowOf("Reapertura")).getByRole("button", { name: /^Editar/ }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(AFECTACIONES[1]);
  });

  it("resolves municipalidad targets and falls back to #id", () => {
    renderTable([CASCADE, { ...CASCADE, idAfectacion: "8", motivo: "Otra", idMunicipalidad: "77", cambios: [] }]);

    expect(within(rowOf("Cierre municipal")).getByText("Municipalidad: Villa Nueva")).toBeInTheDocument();
    expect(within(rowOf("Otra")).getByText("Municipalidad: #77")).toBeInTheDocument();
  });

  it("summarizes the cascade and lists each change, marking reverted ones", () => {
    renderTable([CASCADE]);

    const row = within(rowOf("Cierre municipal"));
    const summary = row.getByText("+3 en cascada");
    fireEvent.click(summary);
    const items = row.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Línea: L1 - Roosevelt: ACTIVA → INACTIVA",
      "Parada: Parada A: ACTIVA → CERRADA (revertido)",
      "Estación: Estación B: ACTIVA → CERRADA",
    ]);
    expect(row.getByText("Parada: Parada A: ACTIVA → CERRADA").closest("s")).not.toBeNull();
  });

  it("shows no cascade summary when only the target changed", () => {
    renderTable([{ ...CASCADE, cambios: CASCADE.cambios.slice(0, 1) }, AFECTACIONES[0]!]);

    expect(screen.queryByText(/en cascada/)).not.toBeInTheDocument();
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
