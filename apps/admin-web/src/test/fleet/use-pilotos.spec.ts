import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePilotos } from "../../features/fleet/hooks/use-pilotos";
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

const PILOTOS = [
  { idEmpleado: "e1", nombre: "Ana" },
  { idEmpleado: "e2", nombre: "Beto", idUnidad: "3" },
];

beforeEach(() => vi.clearAllMocks());

describe("usePilotos", () => {
  it("loads pilots on mount", async () => {
    mockGet.mockResolvedValue(PILOTOS);
    const { result } = renderHook(() => usePilotos());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/fleet/pilots");
    expect(result.current.items).toEqual(PILOTOS);
    expect(result.current.error).toBeNull();
  });

  it("sets a translated error on failure", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "raw", { error: "EmployeeNotFound" }));
    const { result } = renderHook(() => usePilotos());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("El empleado no existe");
    expect(result.current.items).toEqual([]);
  });

  it("refresh refetches", async () => {
    mockGet.mockResolvedValue(PILOTOS);
    const { result } = renderHook(() => usePilotos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGet.mockResolvedValue([PILOTOS[0]]);
    await act(async () => {
      await result.current.refresh();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([PILOTOS[0]]);
  });
});
