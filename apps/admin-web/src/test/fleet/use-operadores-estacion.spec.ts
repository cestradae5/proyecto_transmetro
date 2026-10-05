import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useOperadoresEstacion } from "../../features/fleet/hooks/use-operadores-estacion";
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

const OPERADORES = [
  { idEmpleado: "e1", nombre: "Ana" },
  { idEmpleado: "e2", nombre: "Beto", idEstacionActual: "3" },
];

beforeEach(() => vi.clearAllMocks());

describe("useOperadoresEstacion", () => {
  it("loads station operators on mount", async () => {
    mockGet.mockResolvedValue(OPERADORES);
    const { result } = renderHook(() => useOperadoresEstacion());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/fleet/station-operators");
    expect(result.current.items).toEqual(OPERADORES);
    expect(result.current.error).toBeNull();
  });

  it("sets a translated error on failure", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "raw", { error: "EmployeeNotFound" }));
    const { result } = renderHook(() => useOperadoresEstacion());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("El empleado no existe");
    expect(result.current.items).toEqual([]);
  });

  it("refresh refetches", async () => {
    mockGet.mockResolvedValue(OPERADORES);
    const { result } = renderHook(() => useOperadoresEstacion());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGet.mockResolvedValue([OPERADORES[0]]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([OPERADORES[0]]);
  });
});
