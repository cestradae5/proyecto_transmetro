import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useLineaMunicipalidades,
  mapLineaMunicipalidadError,
} from "../../features/infrastructure/hooks/use-linea-municipalidades";
import { ApiError } from "../../lib/api-client";
import type { LineaMunicipalidad } from "../../features/infrastructure/types/infrastructure.types";

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
const mockDelete = vi.mocked(apiClient.delete);

const LINK: LineaMunicipalidad = { idLinea: "7", idMunicipalidad: "1", nombreMunicipalidad: "Mixco" };

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderLoaded() {
  mockGet.mockResolvedValue([LINK]);
  const hook = renderHook(() => useLineaMunicipalidades("7"));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useLineaMunicipalidades", () => {
  it("fetches the línea's municipalidades on mount", async () => {
    const { result } = await renderLoaded();

    expect(mockGet).toHaveBeenCalledWith("/infrastructure/lineas/7/municipalidades");
    expect(result.current.items).toEqual([LINK]);
  });

  it("sets the mapped error on fetch failure", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "Not Found"));
    const { result } = renderHook(() => useLineaMunicipalidades("7"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("El recurso solicitado no existe o fue eliminado");
  });

  it("addMunicipalidad posts { idMunicipalidad } and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPost.mockResolvedValue({ idLinea: "7", idMunicipalidad: "2" });

    await act(async () => {
      await result.current.addMunicipalidad("2");
    });

    expect(mockPost).toHaveBeenCalledWith("/infrastructure/lineas/7/municipalidades", { idMunicipalidad: "2" });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("removeMunicipalidad deletes the link and refreshes", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.removeMunicipalidad("1");
    });

    expect(mockDelete).toHaveBeenCalledWith("/infrastructure/lineas/7/municipalidades/1");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("rejects a duplicate link with the Spanish message and skips refresh", async () => {
    const { result } = await renderLoaded();
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "LINEA_MUNICIPALIDAD_DUPLICATE" }));

    await expect(result.current.addMunicipalidad("1")).rejects.toThrow(
      "La municipalidad ya está asignada a la línea"
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe("mapLineaMunicipalidadError", () => {
  it("maps LINEA_MUNICIPALIDAD_DUPLICATE", () => {
    expect(
      mapLineaMunicipalidadError(new ApiError(409, "Conflict", { error: "LINEA_MUNICIPALIDAD_DUPLICATE" }))
    ).toBe("La municipalidad ya está asignada a la línea");
  });

  it("maps unknown errors to the connection message", () => {
    expect(mapLineaMunicipalidadError(new ApiError(500, "Server Error"))).toBe(
      "Error de conexión. Por favor, intente de nuevo."
    );
  });
});
