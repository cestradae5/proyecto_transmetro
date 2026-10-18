// odd/tasks/bus-passenger-report.md S7, S8: the pilot sees who is on board,
// the last report, and registers who got off and on at the current stop.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PasajerosPanel } from "../../features/fleet/components/mi-unidad/pasajeros-panel";
import type { StopReport, UnitOccupancy } from "../../features/fleet/hooks/use-pasajeros-unidad";

const REPORT: StopReport = {
  idParadaUnidad: "9",
  idParada: "3",
  nombreParada: "Centro",
  bajaron: 2,
  subieron: 5,
  aBordo: 8,
  porcentaje: 20,
  minutosEsperaExtra: 5,
  fecha: "2026-10-15T10:00:00.000Z",
};

const OCCUPANCY: UnitOccupancy = {
  idUnidad: "7",
  numeroPlaca: "P-777AAA",
  capacidadPasajeros: 40,
  aBordo: 8,
  porcentaje: 20,
  ultimoReporte: REPORT,
};

function renderPanel(overrides: Partial<Parameters<typeof PasajerosPanel>[0]> = {}) {
  const props = {
    occupancy: OCCUPANCY,
    loading: false,
    error: null as string | null,
    hasCurrentStop: true,
    onReport: vi.fn().mockResolvedValue({ ...REPORT, bajaron: 1, subieron: 3, aBordo: 10, minutosEsperaExtra: 0 }),
    ...overrides,
  };
  render(<PasajerosPanel {...props} />);
  return props;
}

const fill = (bajaron: string, subieron: string) => {
  fireEvent.change(screen.getByLabelText("Bajaron"), { target: { value: bajaron } });
  fireEvent.change(screen.getByLabelText("Subieron"), { target: { value: subieron } });
};

describe("PasajerosPanel", () => {
  it("shows who is on board and the last report (S7)", () => {
    renderPanel();

    expect(screen.getByTestId("a-bordo")).toHaveTextContent("A bordo: 8 de 40");
    expect(screen.getByTestId("ultimo-reporte")).toHaveTextContent("Último reporte en Centro: Bajaron 2 · Subieron 5");
    expect(screen.getByText("Espere 5 minutos adicionales en esta parada")).toBeInTheDocument();
  });

  it("shows no last report and no waiting message before the first report", () => {
    renderPanel({ occupancy: { ...OCCUPANCY, aBordo: 0, porcentaje: 0, ultimoReporte: null } });

    expect(screen.getByTestId("a-bordo")).toHaveTextContent("A bordo: 0 de 40");
    expect(screen.queryByTestId("ultimo-reporte")).not.toBeInTheDocument();
    expect(screen.queryByText(/Espere 5 minutos/)).not.toBeInTheDocument();
  });

  it("starts both fields at 0 and sends the numbers (S8)", async () => {
    const props = renderPanel();
    expect(screen.getByLabelText("Bajaron")).toHaveValue(0);
    expect(screen.getByLabelText("Subieron")).toHaveValue(0);

    fill("1", "3");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Registrar pasajeros" })));

    expect(props.onReport).toHaveBeenCalledWith({ bajaron: 1, subieron: 3 });
    expect(screen.getByRole("status")).toHaveTextContent("Bajaron 1 · Subieron 3 · A bordo 10");
    expect(screen.getByLabelText("Bajaron")).toHaveValue(0);
    expect(screen.getByLabelText("Subieron")).toHaveValue(0);
  });

  it("disables the button while sending", async () => {
    let release: (value: StopReport) => void = () => {};
    const onReport = vi.fn(() => new Promise<StopReport>((resolve) => (release = resolve)));
    renderPanel({ onReport });

    fill("0", "1");
    fireEvent.click(screen.getByRole("button", { name: "Registrar pasajeros" }));

    expect(screen.getByRole("button", { name: "Registrando..." })).toBeDisabled();
    await act(async () => release(REPORT));
    expect(screen.getByRole("button", { name: "Registrar pasajeros" })).toBeEnabled();
  });

  it("is disabled without a current stop and says why", () => {
    renderPanel({ hasCurrentStop: false });

    expect(screen.getByRole("button", { name: "Registrar pasajeros" })).toBeDisabled();
    expect(screen.getByText("Marque primero la parada en la que se encuentra.")).toBeInTheDocument();
  });

  it("shows the API message of a rejected report", async () => {
    renderPanel({ onReport: vi.fn().mockRejectedValue(new Error("No pueden bajar 11 pasajeros: la unidad lleva 8.")) });

    fill("11", "0");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Registrar pasajeros" })));

    expect(screen.getByRole("alert")).toHaveTextContent("No pueden bajar 11 pasajeros: la unidad lleva 8.");
  });

  it.each([
    ["-1", "0"],
    ["1.5", "0"],
    ["0", ""],
  ])("rejects bajaron %p / subieron %p without a request", async (bajaron, subieron) => {
    const props = renderPanel();

    fill(bajaron, subieron);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Registrar pasajeros" })));

    expect(props.onReport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Ingrese números enteros mayores o iguales a 0.");
  });

  it("shows the load error", () => {
    renderPanel({ occupancy: null, error: "Servidor caído" });

    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los pasajeros: Servidor caído");
  });
});
