// odd/tasks/bus-passenger-report.md S7, S8: the pilot's passengers hook reads
// GET /operations/ridership/my-unit and reports with POST .../stop-report.
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePasajerosUnidad, type UnitOccupancy } from "../../features/fleet/hooks/use-pasajeros-unidad";
import { ApiError } from "../../lib/api-client";

vi.mock("../../lib/api-client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public data?: any,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

import { apiClient } from "../../lib/api-client";

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

const OCCUPANCY: UnitOccupancy = {
  idUnidad: "7",
  numeroPlaca: "P-777AAA",
  capacidadPasajeros: 40,
  aBordo: 4,
  porcentaje: 10,
  ultimoReporte: null,
};

const REPORT = {
  idParadaUnidad: "9",
  idParada: "3",
  nombreParada: "Centro",
  bajaron: 1,
  subieron: 7,
  aBordo: 10,
  porcentaje: 25,
  minutosEsperaExtra: 0,
  fecha: "2026-10-15T10:00:00.000Z",
};

beforeEach(() => vi.clearAllMocks());

describe("usePasajerosUnidad", () => {
  it("loads the pilot's unit occupancy on mount", async () => {
    mockGet.mockResolvedValue(OCCUPANCY);

    const { result } = renderHook(() => usePasajerosUnidad());

    await waitFor(() => expect(result.current.occupancy).toEqual(OCCUPANCY));
    expect(mockGet).toHaveBeenCalledWith("/operations/ridership/my-unit");
    expect(result.current.error).toBeNull();
  });

  it("reports bajaron and subieron and updates on board and the last report", async () => {
    mockGet.mockResolvedValue(OCCUPANCY);
    mockPost.mockResolvedValue(REPORT);
    const { result } = renderHook(() => usePasajerosUnidad());
    await waitFor(() => expect(result.current.occupancy).not.toBeNull());

    let returned: unknown;
    await act(async () => {
      returned = await result.current.report({ bajaron: 1, subieron: 7 });
    });

    expect(mockPost).toHaveBeenCalledWith("/operations/ridership/my-unit/stop-report", { bajaron: 1, subieron: 7 });
    expect(returned).toEqual(REPORT);
    expect(result.current.occupancy).toEqual({ ...OCCUPANCY, aBordo: 10, porcentaje: 25, ultimoReporte: REPORT });
  });

  it("exposes the API message when loading fails", async () => {
    mockGet.mockRejectedValue(new ApiError(500, "Servidor caído"));

    const { result } = renderHook(() => usePasajerosUnidad());

    await waitFor(() => expect(result.current.error).toBe("Servidor caído"));
    expect(result.current.occupancy).toBeNull();
  });

  it("rethrows a rejected report and keeps the previous occupancy", async () => {
    mockGet.mockResolvedValue(OCCUPANCY);
    mockPost.mockRejectedValue(new ApiError(409, "No pueden bajar 11 pasajeros: la unidad lleva 4."));
    const { result } = renderHook(() => usePasajerosUnidad());
    await waitFor(() => expect(result.current.occupancy).not.toBeNull());

    await act(async () => {
      await expect(result.current.report({ bajaron: 11, subieron: 0 })).rejects.toThrow(
        "No pueden bajar 11 pasajeros: la unidad lleva 4.",
      );
    });

    expect(result.current.occupancy).toEqual(OCCUPANCY);
  });
});
