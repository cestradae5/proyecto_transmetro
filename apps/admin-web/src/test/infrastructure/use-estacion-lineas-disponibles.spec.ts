import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { apiClient, ApiError } from "../../lib/api-client";
import { useEstacionLineasDisponibles } from "../../features/infrastructure/hooks/use-estacion-lineas-disponibles";

const mockGet = vi.mocked(apiClient.get);
const AVAILABLE = [{ idLinea: "6", numeroLinea: "6", nombreLinea: "Línea 6" }];

beforeEach(() => vi.clearAllMocks());

describe("useEstacionLineasDisponibles (S11)", () => {
  it("loads the lines that can be linked to the station", async () => {
    mockGet.mockResolvedValue(AVAILABLE);
    const { result } = renderHook(() => useEstacionLineasDisponibles("10"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/infrastructure/stations/10/lines/available");
    expect(result.current.items).toEqual(AVAILABLE);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch without a station id", async () => {
    const { result } = renderHook(() => useEstacionLineasDisponibles(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("refresh reloads the list", async () => {
    mockGet.mockResolvedValue(AVAILABLE);
    const { result } = renderHook(() => useEstacionLineasDisponibles("10"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGet.mockResolvedValue([]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([]);
  });

  it("sets a translated error when loading fails", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "raw", { error: "StationNotFound" }));
    const { result } = renderHook(() => useEstacionLineasDisponibles("10"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("La estación no existe");
    expect(result.current.items).toEqual([]);
  });
});
