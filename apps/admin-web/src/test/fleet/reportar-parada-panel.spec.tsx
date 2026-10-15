import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ReportarParadaPanel } from "../../features/fleet/components/mi-unidad/reportar-parada-panel";
import type { LineaParadaStop } from "../../features/fleet/types/fleet.types";

const STOPS: LineaParadaStop[] = [
  { idLineaParada: "101", idParada: "p1", nombre: "Terminal", orden: 1 },
  { idLineaParada: "102", idParada: "p2", nombre: "Centro", orden: 2 },
  { idLineaParada: "103", idParada: "p3", nombre: "Plaza", orden: 3 },
];

function renderPanel(overrides: Partial<Parameters<typeof ReportarParadaPanel>[0]> = {}) {
  const props = {
    currentId: null as string | null,
    stops: STOPS,
    stopsLoading: false,
    stopsError: null as string | null,
    onRetryStops: vi.fn(),
    onReport: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ReportarParadaPanel {...props} />);
  return props;
}

afterEach(() => vi.restoreAllMocks());

describe("ReportarParadaPanel", () => {
  it("renders one large button per stop, in the given order", () => {
    renderPanel();
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["Reportar en Terminal", "Reportar en Centro", "Reportar en Plaza"]);
    expect(screen.getByRole("button", { name: "Reportar en Terminal" })).toHaveTextContent("1");
  });

  it("lays the stops out in columns of four rows, filled top to bottom", () => {
    const many: LineaParadaStop[] = Array.from({ length: 9 }, (_, i) => ({
      idLineaParada: `s${i + 1}`,
      idParada: `p${i + 1}`,
      nombre: `Parada ${i + 1}`,
      orden: i + 1,
    }));
    renderPanel({ stops: many });

    const grid = screen.getByTestId("stop-grid");
    expect(grid).toHaveClass("grid-flow-col");
    expect(grid.style.gridTemplateRows).toBe("repeat(4, minmax(0, auto))");
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(
      many.map((s) => `Reportar en ${s.nombre}`),
    );
  });

  it("uses only as many rows as stops when there are fewer than four", () => {
    renderPanel();
    expect(screen.getByTestId("stop-grid").style.gridTemplateRows).toBe("repeat(3, minmax(0, auto))");
  });

  it("reports with a single tap and confirms the new stop", async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Reportar en Centro" }));

    await waitFor(() => expect(props.onReport).toHaveBeenCalledWith("102"));
    expect(props.onReport).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Ubicación actualizada: Centro");
  });

  it("marks the current stop as current and does not let it be reported again", () => {
    const props = renderPanel({ currentId: "102" });
    const current = screen.getByRole("button", { name: "Centro (parada actual)" });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute("aria-current", "location");

    fireEvent.click(current);
    expect(props.onReport).not.toHaveBeenCalled();
  });

  it("highlights the next stop after the current one", () => {
    renderPanel({ currentId: "101" });
    expect(screen.getByRole("button", { name: "Reportar en Centro" })).toHaveTextContent("Siguiente");
    expect(screen.getByRole("button", { name: "Reportar en Plaza" })).not.toHaveTextContent("Siguiente");
  });

  it("does not highlight a next stop when the current one is the last", () => {
    renderPanel({ currentId: "103" });
    expect(screen.queryByText("Siguiente")).not.toBeInTheDocument();
  });

  it("locks every button while a report is in flight", async () => {
    let resolve: () => void = () => {};
    const onReport = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    renderPanel({ onReport });

    fireEvent.click(screen.getByRole("button", { name: "Reportar en Plaza" }));
    expect(screen.getByRole("button", { name: "Reportar en Plaza" })).toHaveTextContent("Reportando...");
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reportar en Terminal" }));
    expect(onReport).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: "Reportar en Terminal" })).toBeEnabled());
  });

  it("shows the report error and re-enables the buttons", async () => {
    renderPanel({
      onReport: vi.fn().mockRejectedValue(new Error("La parada no pertenece a la línea asignada a la unidad")),
    });
    fireEvent.click(screen.getByRole("button", { name: "Reportar en Plaza" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La parada no pertenece");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reportar en Plaza" })).toBeEnabled();
  });

  it("falls back to a generic message when the error has none", async () => {
    renderPanel({ onReport: vi.fn().mockRejectedValue("boom") });
    fireEvent.click(screen.getByRole("button", { name: "Reportar en Plaza" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Error al reportar la ubicación");
  });

  it("explains an empty stops list", () => {
    renderPanel({ stops: [] });
    expect(screen.getByText("La línea no tiene paradas configuradas.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a loading state while the stops load", () => {
    renderPanel({ stopsLoading: true, stops: [] });
    expect(screen.getByText("Cargando paradas...")).toBeInTheDocument();
  });

  it("shows the stops error with a retry", () => {
    const props = renderPanel({ stopsError: "Error de conexión", stops: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las paradas: Error de conexión");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(props.onRetryStops).toHaveBeenCalled();
  });
});
