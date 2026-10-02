import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMiUnidad } from "../../features/fleet/hooks/use-mi-unidad";
import { EstadoUnidad } from "../../features/fleet/types/fleet.types";
import type { LineaParadaStop, Unidad } from "../../features/fleet/types/fleet.types";
import { ApiError } from "../../lib/api-client";

vi.mock("../../lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public data?: any
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

import { apiClient } from "../../lib/api-client";

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

const UNIT: Unidad = {
  idUnidad: "7",
  numeroPlaca: "P-777AAA",
  marca: "Volvo",
  modelo: "B8R",
  anio: 2022,
  capacidadPasajeros: 120,
  estadoUnidad: EstadoUnidad.EN_SERVICIO,
  fechaRegistro: "2026-01-01T00:00:00.000Z",
  fechaActualizacion: "2026-01-01T00:00:00.000Z",
  idLinea: "4",
  nombreLinea: "Línea 12",
};

const STOPS: LineaParadaStop[] = [
  { idLineaParada: "102", idParada: "p2", nombre: "Centro", orden: 2 },
  { idLineaParada: "101", idParada: "p1", nombre: "Terminal", orden: 1 },
];

const noUnitError = () =>
  new ApiError(404, "raw", { statusCode: 404, error: "PilotHasNoUnitAssigned" });

/** Routes GET calls by path so unit and stops can be stubbed independently. */
function stubGet(unit: Unidad | Error, stops: LineaParadaStop[] | Error = STOPS) {
  mockGet.mockImplementation(async (path: string) => {
    const value = path.endsWith("/stops") ? stops : unit;
    if (value instanceof Error) throw value;
    return value;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useMiUnidad", () => {
  it("loads the pilot unit and its ordered stops", async () => {
    stubGet(UNIT);
    const { result } = renderHook(() => useMiUnidad());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.stops).toHaveLength(2));

    expect(mockGet).toHaveBeenCalledWith("/fleet/units/my-unit");
    expect(mockGet).toHaveBeenCalledWith("/fleet/units/my-unit/stops");
    expect(result.current.unit).toEqual(UNIT);
    expect(result.current.noUnit).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.stops.map((s) => s.orden)).toEqual([1, 2]);
  });

  it("treats PilotHasNoUnitAssigned as the no-unit state, not an error", async () => {
    stubGet(noUnitError());
    const { result } = renderHook(() => useMiUnidad());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.noUnit).toBe(true);
    expect(result.current.unit).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockGet).not.toHaveBeenCalledWith("/fleet/units/my-unit/stops");
  });

  it("sets a translated error for other failures", async () => {
    stubGet(new ApiError(500, "boom", {}));
    const { result } = renderHook(() => useMiUnidad());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("boom");
    expect(result.current.noUnit).toBe(false);
  });

  it("does not load stops when the unit has no line", async () => {
    stubGet({ ...UNIT, idLinea: null, nombreLinea: undefined });
    const { result } = renderHook(() => useMiUnidad());

    await waitFor(() => expect(result.current.unit).not.toBeNull());

    expect(mockGet).not.toHaveBeenCalledWith("/fleet/units/my-unit/stops");
    expect(result.current.stops).toEqual([]);
  });

  it("treats UnitHasNoLineAssignment on stops as an empty list", async () => {
    stubGet(UNIT, new ApiError(409, "raw", { error: "UnitHasNoLineAssignment" }));
    const { result } = renderHook(() => useMiUnidad());

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/fleet/units/my-unit/stops"));
    await waitFor(() => expect(result.current.stopsLoading).toBe(false));

    expect(result.current.stops).toEqual([]);
    expect(result.current.stopsError).toBeNull();
  });

  it("exposes a stops error and retries with refreshStops", async () => {
    stubGet(UNIT, new ApiError(500, "Fallo de red", {}));
    const { result } = renderHook(() => useMiUnidad());

    await waitFor(() => expect(result.current.stopsError).toBe("Fallo de red"));

    stubGet(UNIT);
    await act(async () => {
      await result.current.refreshStops();
    });
    expect(result.current.stopsError).toBeNull();
    expect(result.current.stops).toHaveLength(2);
  });

  it("reportLocation posts the stop and silently refreshes the unit", async () => {
    stubGet(UNIT);
    const renders: boolean[] = [];
    const { result } = renderHook(() => {
      const value = useMiUnidad();
      renders.push(value.loading);
      return value;
    });
    await waitFor(() => expect(result.current.unit).not.toBeNull());
    const afterFirstLoad = renders.length;
    const reported = { ...UNIT, idLineaParadaActual: "102", nombreParadaActual: "Centro" };
    stubGet(reported);
    mockPost.mockResolvedValue({ id: "a1", idUnidad: "7", idLinea: "4" });

    await act(async () => {
      await result.current.reportLocation("102");
    });

    expect(mockPost).toHaveBeenCalledWith("/fleet/units/my-unit/location", { idLineaParada: "102" });
    expect(result.current.unit?.nombreParadaActual).toBe("Centro");
    expect(renders.slice(afterFirstLoad).every((l) => l === false)).toBe(true);
  });

  it("reportLocation rejects with a translated message and skips refresh", async () => {
    stubGet(UNIT);
    const { result } = renderHook(() => useMiUnidad());
    await waitFor(() => expect(result.current.unit).not.toBeNull());
    const callsBefore = mockGet.mock.calls.filter(([p]) => p === "/fleet/units/my-unit").length;
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "StopNotInAssignedLine" }));

    await expect(result.current.reportLocation("999")).rejects.toThrow(
      "La parada no pertenece a la línea asignada a la unidad"
    );
    const callsAfter = mockGet.mock.calls.filter(([p]) => p === "/fleet/units/my-unit").length;
    expect(callsAfter).toBe(callsBefore);
  });
});
