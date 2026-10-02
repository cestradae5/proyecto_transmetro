import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ReportarUbicacionDialog } from "../../features/fleet/components/mi-unidad/reportar-ubicacion-dialog";
import { EstadoUnidad, type LineaParadaStop, type Unidad } from "../../features/fleet/types/fleet.types";

const STOPS: LineaParadaStop[] = [
  { idLineaParada: "102", idParada: "p2", nombre: "Centro", orden: 2 },
  { idLineaParada: "101", idParada: "p1", nombre: "Terminal", orden: 1 },
  { idLineaParada: "103", idParada: "p3", nombre: "Plaza", orden: 3 },
];

function unit(overrides: Partial<Unidad> = {}): Unidad {
  return {
    idUnidad: "7",
    numeroPlaca: "P-777AAA",
    marca: "Volvo",
    modelo: "B8R",
    anio: 2022,
    capacidadPasajeros: 120,
    estadoUnidad: EstadoUnidad.EN_SERVICIO,
    fechaRegistro: "2026-01-01",
    fechaActualizacion: "2026-01-01",
    idLinea: "4",
    ...overrides,
  };
}

function renderDialog(u: Unidad, overrides: Partial<Parameters<typeof ReportarUbicacionDialog>[0]> = {}) {
  const props = {
    onReport: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    onRetryStops: vi.fn(),
    stops: STOPS,
    stopsLoading: false,
    stopsError: null,
    ...overrides,
  };
  render(<ReportarUbicacionDialog unit={u} {...props} />);
  return props;
}

afterEach(() => vi.restoreAllMocks());

describe("ReportarUbicacionDialog", () => {
  it("lists the pilot stops with their order and blocks submit until one is picked", async () => {
    const props = renderDialog(unit());
    const options = within(screen.getByLabelText("Parada")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Seleccione una parada", "2. Centro", "1. Terminal", "3. Plaza"]);

    const submit = screen.getByRole("button", { name: "Reportar ubicación" });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Parada"), { target: { value: "101" } });
    fireEvent.click(submit);

    await waitFor(() => expect(props.onReport).toHaveBeenCalledWith("101"));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("never offers a correction action: pilots only POST", () => {
    renderDialog(unit({ idLineaParadaActual: "102", fechaReporteUbicacion: "2026-01-02T10:00:00.000Z" }));

    expect(screen.getByText(/^Centro \(/)).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2. Centro" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Corregir ubicación" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reportar ubicación" })).toBeInTheDocument();
  });

  it("resolves the current stop name from the stops list when the unit lacks it", () => {
    renderDialog(unit({ idLineaParadaActual: "101" }));
    // No nombreParadaActual and no fechaReporteUbicacion: name from the list, no timestamp.
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1. Terminal" })).toBeDisabled();
  });

  it("shows 'Sin reporte' when the unit has never reported", () => {
    renderDialog(unit());
    expect(screen.getByText("Sin reporte")).toBeInTheDocument();
  });

  it("shows the submit error and keeps the dialog open", async () => {
    const props = renderDialog(
      unit(),
      { onReport: vi.fn().mockRejectedValue(new Error("La parada no pertenece a la línea asignada a la unidad")) },
    );
    fireEvent.change(screen.getByLabelText("Parada"), { target: { value: "103" } });
    fireEvent.click(screen.getByRole("button", { name: "Reportar ubicación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La parada no pertenece");
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("explains an empty stops list", () => {
    renderDialog(unit(), { stops: [] });
    expect(screen.getByText("La línea no tiene paradas configuradas.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reportar ubicación" })).toBeDisabled();
  });

  it("shows a loading state while the stops load", () => {
    renderDialog(unit(), { stopsLoading: true, stops: [] });
    expect(screen.getByText("Cargando paradas...")).toBeInTheDocument();
    expect(screen.queryByLabelText("Parada")).not.toBeInTheDocument();
  });

  it("shows the stops error with a retry that does not close the dialog", () => {
    const props = renderDialog(unit(), { stopsError: "Error de conexión", stops: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las paradas: Error de conexión");

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(props.onRetryStops).toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
