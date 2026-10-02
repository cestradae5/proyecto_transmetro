import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UbicacionDialog } from "../../features/fleet/components/unidades/ubicacion-dialog";
import { EstadoUnidad, type Unidad } from "../../features/fleet/types/fleet.types";

const useLineaParadasMock = vi.fn();
vi.mock("../../features/infrastructure/hooks/use-linea-paradas", () => ({
  useLineaParadas: (id: string) => useLineaParadasMock(id),
}));

const STOPS = [
  { idLineaParada: "102", orden: 2, minutosHastaSiguiente: 3, idParada: "p2", idLinea: "4", parada: { nombreParada: "Centro" } },
  { idLineaParada: "101", orden: 1, minutosHastaSiguiente: 3, idParada: "p1", idLinea: "4", parada: { nombreParada: "Terminal" } },
  { idLineaParada: "103", orden: 3, minutosHastaSiguiente: 0, idParada: "p3", idLinea: "4", parada: { nombreParada: "Plaza" } },
];

function stopsState(overrides: Record<string, unknown> = {}) {
  return { lineaParadas: STOPS, loading: false, error: null, refresh: vi.fn(), ...overrides };
}

function unit(overrides: Partial<Unidad> = {}): Unidad {
  return {
    idUnidad: "1",
    numeroPlaca: "P-001",
    marca: "Volvo",
    modelo: "B8R",
    anio: 2020,
    capacidadPasajeros: 80,
    estadoUnidad: EstadoUnidad.DISPONIBLE,
    fechaRegistro: "2024-01-01",
    fechaActualizacion: "2024-01-01",
    idLinea: "4",
    ...overrides,
  };
}

function renderDialog(u: Unidad, overrides: Record<string, unknown> = {}) {
  const props = {
    onReport: vi.fn().mockResolvedValue(undefined),
    onCorrect: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<UbicacionDialog unit={u} {...props} />);
  return props;
}

beforeEach(() => {
  useLineaParadasMock.mockReset();
  useLineaParadasMock.mockReturnValue(stopsState());
});

describe("UbicacionDialog", () => {
  it("loads the stops of the unit line and lists them ordered by orden", () => {
    renderDialog(unit());
    expect(useLineaParadasMock).toHaveBeenCalledWith("4");
    const options = within(screen.getByLabelText("Parada")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Seleccione una parada", "1. Terminal", "2. Centro", "3. Plaza"]);
  });

  it("reports the location when there is no current one and closes", async () => {
    const props = renderDialog(unit());
    expect(screen.getByText("Sin reporte")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Reportar ubicación" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Parada"), { target: { value: "102" } });
    fireEvent.click(submit);

    await waitFor(() => expect(props.onReport).toHaveBeenCalledWith("1", "102"));
    expect(props.onCorrect).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("corrects the location when one exists and disables the current stop", async () => {
    const props = renderDialog(
      unit({ idLineaParadaActual: "102", fechaReporteUbicacion: "2026-01-02T10:00:00Z" })
    );
    expect(screen.getByText(/^Centro \(/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2. Centro" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reportar ubicación" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nueva parada"), { target: { value: "103" } });
    fireEvent.click(screen.getByRole("button", { name: "Corregir ubicación" }));

    await waitFor(() => expect(props.onCorrect).toHaveBeenCalledWith("1", "103"));
    expect(props.onReport).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows submit errors and keeps the dialog open", async () => {
    const props = renderDialog(unit(), {
      onReport: vi.fn().mockRejectedValue(new Error("La parada no pertenece a la línea asignada a la unidad")),
    });
    fireEvent.change(screen.getByLabelText("Parada"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "Reportar ubicación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La parada no pertenece");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("explains the missing line without loading stops", () => {
    renderDialog(unit({ idLinea: null }));
    expect(screen.getByText(/no tiene una línea asignada/)).toBeInTheDocument();
    expect(useLineaParadasMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Reportar ubicación" })).not.toBeInTheDocument();
  });

  it("shows a loading state while stops load", () => {
    useLineaParadasMock.mockReturnValue(stopsState({ loading: true, lineaParadas: [] }));
    renderDialog(unit());
    expect(screen.getByText("Cargando paradas...")).toBeInTheDocument();
    expect(screen.queryByLabelText("Parada")).not.toBeInTheDocument();
  });

  it("shows the stops fetch error with retry", () => {
    const refresh = vi.fn();
    useLineaParadasMock.mockReturnValue(stopsState({ error: "Error de conexión", lineaParadas: [], refresh }));
    renderDialog(unit());
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las paradas: Error de conexión");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refresh).toHaveBeenCalled();
  });
});
