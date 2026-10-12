import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useLineaParadas, mapLineaParadaError } from "../../features/infrastructure/hooks/use-linea-paradas";
import { ApiError } from "../../lib/api-client";
import type { LineaParada } from "../../features/infrastructure/types/infrastructure.types";

vi.mock("../../lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
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
const mockPatch = vi.mocked(apiClient.patch);
const mockDelete = vi.mocked(apiClient.delete);
const mockPut = vi.mocked(apiClient.put);

const SAMPLE_PARADA: LineaParada = {
  idLineaParada: "100",
  orden: 1,
  minutosHastaSiguiente: 5,
  idParada: "5",
  idLinea: "1",
  parada: {
    idParada: 5,
    nombreParada: "Parada Central",
    latitud: 14.6349,
    longitud: -90.5069,
    estadoParada: "ACTIVA" as any,
    fecha_creacion: "2026-01-01T00:00:00.000Z",
    fecha_actualizacion: "2026-01-01T00:00:00.000Z",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useLineaParadas", () => {
  it("fetches parada sequence on mount", async () => {
    mockGet.mockResolvedValue([SAMPLE_PARADA]);

    const { result } = renderHook(() => useLineaParadas("1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith("/infrastructure/lineas/1/paradas");
    expect(result.current.lineaParadas).toEqual([SAMPLE_PARADA]);
    expect(result.current.error).toBeNull();
  });

  it("sets error message on fetch failure", async () => {
    mockGet.mockRejectedValue(new ApiError(500, "Server Error"));

    const { result } = renderHook(() => useLineaParadas("1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(
      "Error de conexión. Por favor, intente de nuevo."
    );
    expect(result.current.lineaParadas).toEqual([]);
  });

  it("addParada posts and refreshes", async () => {
    mockGet.mockResolvedValue([SAMPLE_PARADA]);
    mockPost.mockResolvedValue({ ...SAMPLE_PARADA, idLineaParada: "101" });

    const { result } = renderHook(() => useLineaParadas("1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let added: LineaParada | undefined;
    await act(async () => {
      added = await result.current.addParada({
        idParada: "6",
        orden: 2,
        minutosHastaSiguiente: 3,
      });
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/infrastructure/lineas/1/paradas",
      { idParada: "6", orden: 2, minutosHastaSiguiente: 3 }
    );
    expect(added?.idLineaParada).toBe("101");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("updateParada patches and refreshes", async () => {
    mockGet.mockResolvedValue([SAMPLE_PARADA]);
    mockPatch.mockResolvedValue({ ...SAMPLE_PARADA, orden: 3 });

    const { result } = renderHook(() => useLineaParadas("1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let updated: LineaParada | undefined;
    await act(async () => {
      updated = await result.current.updateParada("100", {
        orden: 3,
        minutosHastaSiguiente: 7,
      });
    });

    expect(mockPatch).toHaveBeenCalledWith(
      "/infrastructure/lineas/1/paradas/100",
      { orden: 3, minutosHastaSiguiente: 7 }
    );
    expect(updated?.orden).toBe(3);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("removeParada deletes and refreshes", async () => {
    mockGet.mockResolvedValue([SAMPLE_PARADA]);
    mockDelete.mockResolvedValue(undefined);

    const { result } = renderHook(() => useLineaParadas("1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.removeParada("100");
    });

    expect(mockDelete).toHaveBeenCalledWith(
      "/infrastructure/lineas/1/paradas/100"
    );
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  async function renderLoaded() {
    mockGet.mockResolvedValue([SAMPLE_PARADA]);
    const hook = renderHook(() => useLineaParadas("1"));
    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
    });
    return hook;
  }

  it("addParada rejects with translated message and skips refresh", async () => {
    const { result } = await renderLoaded();
    mockPost.mockRejectedValue(
      new ApiError(409, "raw backend text", { error: "PARADA_ALREADY_IN_LINEA" })
    );

    await expect(
      result.current.addParada({ idParada: "5", orden: 2, minutosHastaSiguiente: 3 })
    ).rejects.toThrow("Esta parada ya está asignada a la línea");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("updateParada rejects with translated message", async () => {
    const { result } = await renderLoaded();
    mockPatch.mockRejectedValue(
      new ApiError(409, "raw backend text", { error: "ORDEN_DUPLICATE" })
    );

    await expect(
      result.current.updateParada("100", { orden: 2, minutosHastaSiguiente: 1 })
    ).rejects.toThrow("Ya existe una parada con este orden en la línea");
  });

  it("removeParada rejects with translated message", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockRejectedValue(
      new ApiError(409, "La línea 1 debe conservar al menos 2 paradas", {
        error: "LINEA_MIN_PARADAS",
      })
    );

    await expect(result.current.removeParada("100")).rejects.toThrow(
      "Una línea debe tener al menos 2 paradas"
    );
  });

  it("reorderParadas PUTs the full id list and uses the returned order without refetching", async () => {
    const { result } = await renderLoaded();
    const second = { ...SAMPLE_PARADA, idLineaParada: "101", orden: 1 };
    const first = { ...SAMPLE_PARADA, orden: 2 };
    mockPut.mockResolvedValue([second, first]);

    await act(async () => {
      await result.current.reorderParadas(["101", "100"]);
    });

    expect(mockPut).toHaveBeenCalledWith("/infrastructure/lineas/1/paradas/orden", {
      idsLineaParada: ["101", "100"],
    });
    expect(result.current.lineaParadas).toEqual([second, first]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("reorderParadas rejects with the ORDEN_LIST_MISMATCH message", async () => {
    const { result } = await renderLoaded();
    mockPut.mockRejectedValue(new ApiError(400, "raw", { error: "ORDEN_LIST_MISMATCH" }));

    await expect(result.current.reorderParadas(["100"])).rejects.toThrow(
      "La secuencia de paradas cambió. Recargue e intente de nuevo."
    );
  });
});

describe("mapLineaParadaError", () => {
  it("maps 404 to generic not-found message", () => {
    const err = new ApiError(404, "Not Found");
    expect(mapLineaParadaError(err)).toBe(
      "El recurso solicitado no existe o fue eliminado"
    );
  });

  it("maps PARADA_ALREADY_IN_LINEA", () => {
    const err = new ApiError(409, "Conflict", {
      error: "PARADA_ALREADY_IN_LINEA",
    });
    expect(mapLineaParadaError(err)).toBe(
      "Esta parada ya está asignada a la línea"
    );
  });

  it("maps ORDEN_DUPLICATE", () => {
    const err = new ApiError(409, "Conflict", { error: "ORDEN_DUPLICATE" });
    expect(mapLineaParadaError(err)).toBe(
      "Ya existe una parada con este orden en la línea"
    );
  });

  it("maps LINEA_MIN_PARADAS", () => {
    const err = new ApiError(409, "Conflict", {
      error: "LINEA_MIN_PARADAS",
    });
    expect(mapLineaParadaError(err)).toBe(
      "Una línea debe tener al menos 2 paradas"
    );
  });

  it("maps unknown errors to connection message", () => {
    const err = new ApiError(500, "Server Error");
    expect(mapLineaParadaError(err)).toBe(
      "Error de conexión. Por favor, intente de nuevo."
    );
  });

  it("maps non-ApiError to connection message", () => {
    expect(mapLineaParadaError(new Error("network"))).toBe(
      "Error de conexión. Por favor, intente de nuevo."
    );
  });
});
