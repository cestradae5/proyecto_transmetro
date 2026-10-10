import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { MunicipalidadesTable } from "../../features/infrastructure/components/municipalidades/municipalidades-table";
import {
  EstadoMunicipalidad,
  type Municipalidad,
} from "../../features/infrastructure/types/infrastructure.types";

const MUNICIPALIDADES: Municipalidad[] = [
  {
    idMunicipalidad: "1",
    nombreMunicipalidad: "Mixco",
    departamento: "Guatemala",
    estadoMunicipalidad: EstadoMunicipalidad.ACTIVA,
  },
  {
    idMunicipalidad: "2",
    nombreMunicipalidad: "Antigua Guatemala",
    departamento: "Sacatepéquez",
    estadoMunicipalidad: EstadoMunicipalidad.INACTIVA,
  },
];

function renderTable(overrides: { onDelete?: (id: string) => Promise<unknown> } = {}) {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const onDelete = overrides.onDelete ?? vi.fn<(id: string) => Promise<unknown>>().mockResolvedValue(undefined);
  const utils = render(
    <MunicipalidadesTable municipalidades={MUNICIPALIDADES} onUpdate={onUpdate} onDelete={onDelete} />
  );
  return { ...utils, onUpdate, onDelete };
}

function rowOf(nombre: string) {
  return screen.getByText(nombre).closest("tr") as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MunicipalidadesTable", () => {
  it("lists nombre, departamento and estado", () => {
    renderTable();

    const row = rowOf("Mixco");
    expect(within(row).getByText("Guatemala")).toBeInTheDocument();
    expect(within(row).getByText("ACTIVA")).toHaveClass("bg-green-100");
    expect(within(rowOf("Antigua Guatemala")).getByText("INACTIVA")).toHaveClass("bg-red-100");
  });

  it("filters by nombre or departamento", () => {
    renderTable();

    fireEvent.change(screen.getByPlaceholderText("Buscar municipalidad..."), { target: { value: "sacate" } });

    expect(screen.queryByText("Mixco")).not.toBeInTheDocument();
    expect(screen.getByText("Antigua Guatemala")).toBeInTheDocument();
  });

  it("offers Desactivar only for active municipalidades", () => {
    renderTable();

    expect(within(rowOf("Mixco")).getByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    expect(within(rowOf("Antigua Guatemala")).queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  });

  it("deactivates after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onDelete } = renderTable();

    fireEvent.click(within(rowOf("Mixco")).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("1"));
  });

  it("does not deactivate when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onDelete } = renderTable();

    fireEvent.click(within(rowOf("Mixco")).getByRole("button", { name: "Desactivar" }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows the error when deactivation fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderTable({ onDelete: vi.fn().mockRejectedValue(new Error("La municipalidad no existe o fue eliminada")) });

    fireEvent.click(within(rowOf("Mixco")).getByRole("button", { name: "Desactivar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La municipalidad no existe o fue eliminada");
  });

  it("edits through onUpdate with the municipalidad id", async () => {
    const { onUpdate } = renderTable();

    fireEvent.click(within(rowOf("Mixco")).getByRole("button", { name: "Editar" }));
    const dialog = screen.getByRole("dialog", { name: "Editar Municipalidad" });
    fireEvent.change(within(dialog).getByLabelText(/^Departamento/), { target: { value: "Guatemala Norte" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith("1", {
        nombreMunicipalidad: "Mixco",
        departamento: "Guatemala Norte",
        estadoMunicipalidad: "ACTIVA",
      })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
