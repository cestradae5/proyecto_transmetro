import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMiEstacion } from "../../features/fleet/hooks/use-mi-estacion";
import { ApiError } from "../../lib/api-client";

vi.mock("../../lib/api-client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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

const MI_ESTACION = {
  station: { idEstacion: "1", nombreEstacion: "Central", estadoEstacion: "ACTIVA", latitud: 14.6, longitud: -90.5 },
  lines: [
    {
      idLinea: "2",
      numeroLinea: "L1",
      nombreLinea: "Linea 1",
      colorHex: "#ff0000",
      estadoLinea: "ACTIVA",
      tipoPunto: "PRINCIPAL",
      stops: [{ idLineaParada: "5", orden: 1, idParada: "9", nombreParada: "Parada", isStationStop: true }],
    },
  ],
  units: [
    { idUnidad: "7", numeroPlaca: "P-123", estadoUnidad: "EN_SERVICIO", idLinea: "2", pilotAssigned: true },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("useMiEstacion", () => {
  it("loads the operator station on mount", async () => {
    mockGet.mockResolvedValue(MI_ESTACION);
    const { result } = renderHook(() => useMiEstacion());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/fleet/my-station");
    expect(result.current.data).toEqual(MI_ESTACION);
    expect(result.current.noStation).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("treats OperatorHasNoStation as an expected state, not an error", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "raw", { error: "OperatorHasNoStation" }));
    const { result } = renderHook(() => useMiEstacion());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.noStation).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets a translated error for other failures", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "raw", { error: "StationNotFound" }));
    const { result } = renderHook(() => useMiEstacion());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("La estación no existe");
    expect(result.current.noStation).toBe(false);
  });

  it("refresh recovers after a no-station answer", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "raw", { error: "OperatorHasNoStation" }));
    const { result } = renderHook(() => useMiEstacion());
    await waitFor(() => expect(result.current.noStation).toBe(true));

    mockGet.mockResolvedValue(MI_ESTACION);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.noStation).toBe(false);
    expect(result.current.data).toEqual(MI_ESTACION);
  });
});
