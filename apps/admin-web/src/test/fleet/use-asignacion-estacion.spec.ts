import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAsignacionEstacion } from "../../features/fleet/hooks/use-asignacion-estacion";
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
const mockPost = vi.mocked(apiClient.post);
const mockPatch = vi.mocked(apiClient.patch);
const mockDelete = vi.mocked(apiClient.delete);

const ASIGNACION = {
  idAsignacionEstacion: "10",
  idEmpleado: "e1",
  nombreEmpleado: "Ana",
  idEstacion: "1",
  nombreEstacion: "Central",
  estadoAsignacion: "ACTIVA",
  fechaAsignacion: "2026-01-01",
};

async function renderLoaded(initial: unknown[] = [ASIGNACION]) {
  mockGet.mockResolvedValue(initial);
  const hook = renderHook(() => useAsignacionEstacion());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => vi.clearAllMocks());

describe("useAsignacionEstacion", () => {
  it("loads assignments on mount", async () => {
    mockGet.mockResolvedValue([ASIGNACION]);
    const { result } = renderHook(() => useAsignacionEstacion());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/fleet/station-assignments");
    expect(result.current.items).toEqual([ASIGNACION]);
    expect(result.current.error).toBeNull();
  });

  it("sets a translated error when loading fails", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "raw", { error: "StationNotFound" }));
    const { result } = renderHook(() => useAsignacionEstacion());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("La estación no existe");
    expect(result.current.items).toEqual([]);
  });

  it("assign posts the body and refreshes the list", async () => {
    const { result } = await renderLoaded([]);
    mockPost.mockResolvedValue(ASIGNACION);
    mockGet.mockResolvedValue([ASIGNACION]);

    await act(async () => {
      await expect(result.current.assign("e1", "1")).resolves.toEqual(ASIGNACION);
    });
    expect(mockPost).toHaveBeenCalledWith("/fleet/station-assignments", { idEmpleado: "e1", idEstacion: "1" });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual([ASIGNACION]);
  });

  it("reassign patches the assignment path and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPatch.mockResolvedValue({ ...ASIGNACION, idEstacion: "2" });
    mockGet.mockResolvedValue([{ ...ASIGNACION, idEstacion: "2" }]);

    await act(async () => {
      await expect(result.current.reassign("10", "2")).resolves.toMatchObject({ idEstacion: "2" });
    });
    expect(mockPatch).toHaveBeenCalledWith("/fleet/station-assignments/10", { idEstacion: "2" });
    expect(result.current.items[0]?.idEstacion).toBe("2");
  });

  it("unassign deletes, resolves null and refreshes", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockResolvedValue(null);
    mockGet.mockResolvedValue([]);

    await act(async () => {
      await expect(result.current.unassign("10")).resolves.toBeNull();
    });
    expect(mockDelete).toHaveBeenCalledWith("/fleet/station-assignments/10");
    expect(result.current.items).toEqual([]);
  });

  it("maps mutation errors and does not refetch on failure", async () => {
    const { result } = await renderLoaded();
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "OperatorAlreadyAssigned" }));
    mockPatch.mockRejectedValue(new ApiError(404, "raw", { error: "AssignmentNotFound" }));
    mockDelete.mockRejectedValue(new ApiError(404, "raw", { error: "AssignmentNotFound" }));

    await expect(result.current.assign("e1", "1")).rejects.toThrow("El operador ya tiene una estación asignada");
    await expect(result.current.reassign("10", "2")).rejects.toThrow(
      "El operador no tiene una asignación de estación activa"
    );
    await expect(result.current.unassign("10")).rejects.toThrow(
      "El operador no tiene una asignación de estación activa"
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
