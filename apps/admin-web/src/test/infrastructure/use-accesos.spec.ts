import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAccesos, mapAccesoError } from "../../features/infrastructure/hooks/use-accesos";
import { ApiError } from "../../lib/api-client";
import {
  EstadoAcceso,
  TipoAcceso,
  type Acceso,
} from "../../features/infrastructure/types/infrastructure.types";

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
const mockPatch = vi.mocked(apiClient.patch);
const mockDelete = vi.mocked(apiClient.delete);

const ACCESO: Acceso = {
  idAcceso: "3",
  idParada: "5",
  nombreAcceso: "Acceso norte",
  latitud: 14.6,
  longitud: -90.5,
  tipoAcceso: TipoAcceso.RAMPA,
  estadoAcceso: EstadoAcceso.HABILITADO,
};

const NEW_ACCESO = {
  nombreAcceso: "Acceso sur",
  latitud: 14.61,
  longitud: -90.51,
  tipoAcceso: TipoAcceso.PEATONAL,
};

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderLoaded() {
  mockGet.mockResolvedValue([ACCESO]);
  const hook = renderHook(() => useAccesos("5"));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useAccesos", () => {
  it("fetches the parada's accesos on mount", async () => {
    const { result } = await renderLoaded();

    expect(mockGet).toHaveBeenCalledWith("/infrastructure/paradas/5/accesos");
    expect(result.current.accesos).toEqual([ACCESO]);
  });

  it("sets the mapped error on fetch failure", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "Not Found"));
    const { result } = renderHook(() => useAccesos("5"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("La parada o el acceso no existe o fue eliminado");
  });

  it("createAcceso posts under the parada and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPost.mockResolvedValue({ ...ACCESO, idAcceso: "4" });

    await act(async () => {
      await result.current.createAcceso(NEW_ACCESO);
    });

    expect(mockPost).toHaveBeenCalledWith("/infrastructure/paradas/5/accesos", NEW_ACCESO);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("updateAcceso patches the acceso and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPatch.mockResolvedValue(ACCESO);

    await act(async () => {
      await result.current.updateAcceso("3", { tipoAcceso: TipoAcceso.ELEVADOR });
    });

    expect(mockPatch).toHaveBeenCalledWith("/infrastructure/paradas/5/accesos/3", { tipoAcceso: "ELEVADOR" });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("deleteAcceso calls DELETE (soft delete) and refreshes", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.deleteAcceso("3");
    });

    expect(mockDelete).toHaveBeenCalledWith("/infrastructure/paradas/5/accesos/3");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("rejects with the translated message and skips refresh", async () => {
    const { result } = await renderLoaded();
    mockPost.mockRejectedValue(new ApiError(400, "Bad Request"));

    await expect(result.current.createAcceso(NEW_ACCESO)).rejects.toThrow("Los datos del acceso no son válidos");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe("mapAccesoError", () => {
  it("maps unknown errors to the connection message", () => {
    expect(mapAccesoError(new ApiError(500, "Server Error"))).toBe(
      "Error de conexión. Por favor, intente de nuevo."
    );
    expect(mapAccesoError(new Error("network"))).toBe("Error de conexión. Por favor, intente de nuevo.");
  });
});
