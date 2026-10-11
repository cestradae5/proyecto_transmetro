import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InfrastructurePage } from "../../features/infrastructure";

// The page only wires hooks to tables: every data hook is stubbed so the test
// focuses on the layout (creation-flow tab order, no standalone Estaciones tab,
// the "Nueva infraestructura" wizard as the creation path). Each hook shares
// one `refresh` mock per key so the post-wizard reload can be asserted.
const { refreshes, stubList, createMunicipalidad } = vi.hoisted(() => {
  const refreshes: Record<string, ReturnType<typeof vi.fn>> = {};
  const createMunicipalidad = vi.fn();
  return {
    refreshes,
    createMunicipalidad,
    stubList:
      (key: string, extra: Record<string, unknown> = {}) =>
      () => {
        refreshes[key] ??= vi.fn();
        return { [key]: [], loading: false, error: null, refresh: refreshes[key], ...extra };
      },
  };
});

vi.mock("../../features/infrastructure/hooks/use-lineas", () => ({ useLineas: stubList("lineas") }));
vi.mock("../../features/infrastructure/hooks/use-paradas", () => ({ useParadas: stubList("paradas") }));
vi.mock("../../features/infrastructure/hooks/use-estaciones", () => ({ useEstaciones: stubList("estaciones") }));
vi.mock("../../features/infrastructure/hooks/use-parqueos", () => ({ useParqueos: stubList("parqueos") }));
vi.mock("../../features/infrastructure/hooks/use-afectaciones", () => ({ useAfectaciones: stubList("afectaciones") }));
vi.mock("../../features/infrastructure/hooks/use-municipalidades", () => ({
  useMunicipalidades: stubList("municipalidades", { createMunicipalidad }),
}));

beforeEach(() => {
  Object.values(refreshes).forEach((fn) => fn.mockClear());
  createMunicipalidad.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("switches to the Líneas tab", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Líneas (0)" }));
    expect(screen.getByPlaceholderText("Buscar línea...")).toBeInTheDocument();
  });

  it("switches to the Paradas tab", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Paradas (0)" }));
    expect(screen.getByPlaceholderText("Buscar parada...")).toBeInTheDocument();
  });
});

describe("InfrastructurePage creation paths", () => {
  it("has no per-tab 'Crear Nuevo' for municipalidades, líneas, paradas or parqueos", () => {
    renderPage();

    for (const tab of ["Municipalidades (0)", "Líneas (0)", "Paradas (0)", "Parqueos (0)"]) {
      fireEvent.click(screen.getByRole("button", { name: tab }));
      expect(screen.queryByRole("button", { name: "Crear Nuevo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Nueva afectación" })).not.toBeInTheDocument();
    }
  });

  it("keeps afectación creation on the Afectaciones tab", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Afectaciones (0)" }));
    fireEvent.click(screen.getByRole("button", { name: "Nueva afectación" }));
    expect(screen.getByText("Nueva Afectación")).toBeInTheDocument();
  });

  it("opens the wizard from 'Nueva infraestructura' and closes it without reloading when nothing was saved", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Nueva infraestructura" }));
    expect(screen.getByRole("dialog", { name: "Nueva infraestructura" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar asistente" }));
    expect(screen.queryByRole("dialog", { name: "Nueva infraestructura" })).not.toBeInTheDocument();
    expect(refreshes.municipalidades).not.toHaveBeenCalled();
  });

  it("reloads the page data after closing a wizard that saved data", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    createMunicipalidad.mockResolvedValue({
      idMunicipalidad: "7",
      nombreMunicipalidad: "Villa Nueva",
      departamento: "Guatemala",
      estadoMunicipalidad: "ACTIVA",
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Nueva infraestructura" }));
    fireEvent.click(screen.getByLabelText("Crear nueva"));
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Villa Nueva" } });
    fireEvent.change(screen.getByLabelText("Departamento *"), { target: { value: "Guatemala" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("button", { name: "Crear línea" });

    fireEvent.click(screen.getByRole("button", { name: "Cerrar asistente" }));

    expect(screen.queryByRole("dialog", { name: "Nueva infraestructura" })).not.toBeInTheDocument();
    await waitFor(() => {
      for (const key of ["municipalidades", "lineas", "paradas", "parqueos", "estaciones"]) {
        expect(refreshes[key]).toHaveBeenCalled();
      }
    });
  });
});
