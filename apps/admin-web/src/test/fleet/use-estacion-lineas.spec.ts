import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEstacionLineas } from "../../features/fleet/hooks/use-estacion-lineas";
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

const LINK = {
  idEstacion: "1",
  idLinea: "2",
  nombreLinea: "Linea 1",
  tipoPunto: "PRINCIPAL",
  estadoAsignacion: "ACTIVA",
};
const LIST_PATH = "/infrastructure/stations/1/lines";

async function renderLoaded(initial: unknown[] = [LINK]) {
  mockGet.mockResolvedValue(initial);
  const hook = renderHook(() => useEstacionLineas("1"));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

beforeEach(() => vi.clearAllMocks());

describe("useEstacionLineas", () => {
  it("loads the station lines on mount", async () => {
    mockGet.mockResolvedValue([LINK]);
    const { result } = renderHook(() => useEstacionLineas("1"));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith(LIST_PATH);
    expect(result.current.items).toEqual([LINK]);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch without a station id", async () => {
    const { result } = renderHook(() => useEstacionLineas(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
  });

  it("refetches when the station id changes", async () => {
    mockGet.mockResolvedValue([LINK]);
    const { result, rerender } = renderHook(({ id }) => useEstacionLineas(id), {
      initialProps: { id: "1" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockGet.mockResolvedValue([]);
    rerender({ id: "5" });
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/infrastructure/stations/5/lines"));
    await waitFor(() => expect(result.current.items).toEqual([]));
  });

  it("sets a translated error when loading fails", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "raw", { error: "StationNotFound" }));
    const { result } = renderHook(() => useEstacionLineas("1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("La estación no existe");
  });

  it("addLine posts the body and refreshes", async () => {
    const { result } = await renderLoaded([]);
    mockPost.mockResolvedValue(LINK);
    mockGet.mockResolvedValue([LINK]);

    await act(async () => {
      await expect(result.current.addLine({ idLinea: "2", tipoPunto: "PRINCIPAL" })).resolves.toEqual(LINK);
    });
    expect(mockPost).toHaveBeenCalledWith(LIST_PATH, { idLinea: "2", tipoPunto: "PRINCIPAL" });
    expect(result.current.items).toEqual([LINK]);
  });

  it("updateLine patches the link path and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPatch.mockResolvedValue({ ...LINK, tipoPunto: "CONTROL" });
    mockGet.mockResolvedValue([{ ...LINK, tipoPunto: "CONTROL" }]);

    await act(async () => {
      await result.current.updateLine("2", { tipoPunto: "CONTROL" });
    });
    expect(mockPatch).toHaveBeenCalledWith(`${LIST_PATH}/2`, { tipoPunto: "CONTROL" });
    expect(result.current.items[0]?.tipoPunto).toBe("CONTROL");
  });

  it("removeLine deletes, resolves null and refreshes", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockResolvedValue(null);
    mockGet.mockResolvedValue([]);

    await act(async () => {
      await expect(result.current.removeLine("2")).resolves.toBeNull();
    });
    expect(mockDelete).toHaveBeenCalledWith(`${LIST_PATH}/2`);
    expect(result.current.items).toEqual([]);
  });

  it("maps mutation errors and does not refetch on failure", async () => {
    const { result } = await renderLoaded();
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "ESTACION_LINEA_DUPLICATE" }));
    mockPatch.mockRejectedValue(new ApiError(404, "raw", { error: "LineNotFound" }));
    mockDelete.mockRejectedValue(new ApiError(404, "raw", { error: "LineNotFound" }));

    await expect(result.current.addLine({ idLinea: "2", tipoPunto: "APOYO" })).rejects.toThrow(
      "La línea ya está vinculada a esta estación"
    );
    await expect(result.current.updateLine("2", {})).rejects.toThrow("La línea no existe");
    await expect(result.current.removeLine("2")).rejects.toThrow("La línea no existe");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
