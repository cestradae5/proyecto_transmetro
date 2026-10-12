import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { InfrastructurePage } from "../../features/infrastructure";

// The page only wires hooks to tables: every data hook is stubbed so the test
// focuses on the tab layout (creation-flow order, no standalone Estaciones tab).
const { stubList } = vi.hoisted(() => ({
  stubList: (key: string, items: unknown[] = []) => () => ({
    [key]: items,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("../../features/infrastructure/hooks/use-lineas", () => ({ useLineas: stubList("lineas") }));
vi.mock("../../features/infrastructure/hooks/use-paradas", () => ({ useParadas: stubList("paradas") }));
vi.mock("../../features/infrastructure/hooks/use-estaciones", () => ({ useEstaciones: stubList("estaciones") }));
vi.mock("../../features/infrastructure/hooks/use-parqueos", () => ({ useParqueos: stubList("parqueos") }));
vi.mock("../../features/infrastructure/hooks/use-afectaciones", () => ({ useAfectaciones: stubList("afectaciones") }));
vi.mock("../../features/infrastructure/hooks/use-municipalidades", () => ({
  useMunicipalidades: stubList("municipalidades"),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <InfrastructurePage />
    </MemoryRouter>,
  );
}

function tabLabels() {
  return screen
    .getAllByRole("button")
    .map((button) => button.textContent ?? "")
    .filter((text) => /\(\d+\)$/.test(text));
}

describe("InfrastructurePage tabs", () => {
  it("follows the creation flow order: Municipalidades -> Líneas -> Paradas -> Parqueos -> Afectaciones", () => {
    renderPage();

    expect(tabLabels()).toEqual([
      "Municipalidades (0)",
      "Líneas (0)",
      "Paradas (0)",
      "Parqueos (0)",
      "Afectaciones (0)",
    ]);
  });

  it("has no standalone Estaciones tab (estaciones are managed from the parada form)", () => {
    renderPage();

    expect(screen.queryByRole("button", { name: /^Estaciones/ })).not.toBeInTheDocument();
  });

  it("opens on the Municipalidades tab by default", () => {
    renderPage();

    expect(screen.getByPlaceholderText("Buscar municipalidad...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Municipalidades (0)" })).toHaveClass("text-primary");
    expect(screen.getByRole("button", { name: "Líneas (0)" })).not.toHaveClass("text-primary");
  });

  it("opens the municipalidad create dialog from Crear Nuevo on the default tab", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Crear Nuevo" }));
    expect(screen.getByRole("dialog", { name: "Nueva Municipalidad" })).toBeInTheDocument();
  });

  it("switches to the Líneas tab", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Líneas (0)" }));
    expect(screen.getByPlaceholderText("Buscar línea...")).toBeInTheDocument();
  });

  it("switches to the Paradas tab and its create dialog shows the estación toggle", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Paradas (0)" }));
    expect(screen.getByPlaceholderText("Buscar parada...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Crear Nuevo" }));
    expect(screen.getByText("Nueva Parada")).toBeInTheDocument();
    expect(screen.getByLabelText("Es estación")).not.toBeChecked();
  });
});
