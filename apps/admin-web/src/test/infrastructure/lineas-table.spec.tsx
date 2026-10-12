import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LineasTable } from "../../features/infrastructure/components/lineas/lineas-table";
import {
  EstadoMunicipalidad,
  type Linea,
  type Municipalidad,
} from "../../features/infrastructure/types/infrastructure.types";

// The municipalidades dialog has its own spec; stub it so this test only checks
// that the lineas table opens it for the right línea with the catalog.
vi.mock("../../features/infrastructure/components/lineas/linea-municipalidades-dialog", () => ({
  LineaMunicipalidadesDialog: ({ linea, municipalidades }: { linea: Linea; municipalidades: Municipalidad[] }) => (
    <div role="dialog" aria-label="Municipalidades de la línea">{`${linea.idLinea}:${municipalidades.length}`}</div>
  ),
}));

const LINEAS: Linea[] = [
  {
    idLinea: "7",
    numeroLinea: "L7",
    nombreLinea: "Periférico",
    colorHex: "#00ff00",
    tipoRecorrido: "LINEAL" as Linea["tipoRecorrido"],
    idParqueo: null,
    estadoLinea: "ACTIVA" as Linea["estadoLinea"],
  },
];

const MUNICIPALIDADES: Municipalidad[] = [
  { idMunicipalidad: "1", nombreMunicipalidad: "Mixco", departamento: "Guatemala", estadoMunicipalidad: EstadoMunicipalidad.ACTIVA },
];

describe("LineasTable", () => {
  it("opens the municipalidades dialog for the línea", () => {
    render(
      <LineasTable
        lineas={LINEAS}
        parqueos={[]}
        paradas={[]}
        municipalidades={MUNICIPALIDADES}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const row = screen.getByText("Periférico").closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Municipalidades" }));

    expect(screen.getByRole("dialog", { name: "Municipalidades de la línea" })).toHaveTextContent("7:1");
  });
});
