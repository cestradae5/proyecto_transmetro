import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  useMunicipalidades,
  mapMunicipalidadError,
} from "../../features/infrastructure/hooks/use-municipalidades";
import { ApiError } from "../../lib/api-client";
import {
  EstadoMunicipalidad,
  type Municipalidad,
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

const SAMPLE: Municipalidad = {
  idMunicipalidad: "1",
  nombreMunicipalidad: "Mixco",
  departamento: "Guatemala",
  estadoMunicipalidad: EstadoMunicipalidad.ACTIVA,
};

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderLoaded() {
  mockGet.mockResolvedValue([SAMPLE]);
  const hook = renderHook(() => useMunicipalidades());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useMunicipalidades", () => {
  it("fetches municipalidades on mount", async () => {
    const { result } = await renderLoaded();

    expect(mockGet).toHaveBeenCalledWith("/infrastructure/municipalidades");
    expect(result.current.municipalidades).toEqual([SAMPLE]);
    expect(result.current.error).toBeNull();
  });

  it("sets the mapped error on fetch failure", async () => {
    mockGet.mockRejectedValue(new ApiError(500, "Server Error"));
    const { result } = renderHook(() => useMunicipalidades());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Error de conexión. Por favor, intente de nuevo.");
  });

  it("createMunicipalidad posts and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPost.mockResolvedValue({ ...SAMPLE, idMunicipalidad: "2" });

    await act(async () => {
      await result.current.createMunicipalidad({ nombreMunicipalidad: "Villa Nueva", departamento: "Guatemala" });
    });

    expect(mockPost).toHaveBeenCalledWith("/infrastructure/municipalidades", {
      nombreMunicipalidad: "Villa Nueva",
      departamento: "Guatemala",
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("updateMunicipalidad patches and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPatch.mockResolvedValue(SAMPLE);

    await act(async () => {
      await result.current.updateMunicipalidad("1", { departamento: "Sacatepéquez" });
    });

    expect(mockPatch).toHaveBeenCalledWith("/infrastructure/municipalidades/1", { departamento: "Sacatepéquez" });
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("deleteMunicipalidad calls DELETE (soft delete) and refreshes", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.deleteMunicipalidad("1");
    });

    expect(mockDelete).toHaveBeenCalledWith("/infrastructure/municipalidades/1");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("rejects a duplicate name with the Spanish message and skips refresh", async () => {
    const { result } = await renderLoaded();
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "MUNICIPALIDAD_NOMBRE_DUPLICATE" }));

    await expect(
      result.current.createMunicipalidad({ nombreMunicipalidad: "Mixco", departamento: "Guatemala" })
    ).rejects.toThrow("Ya existe una municipalidad con ese nombre");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe("mapMunicipalidadError", () => {
  it("maps MUNICIPALIDAD_NOMBRE_DUPLICATE", () => {
    expect(
      mapMunicipalidadError(new ApiError(409, "Conflict", { error: "MUNICIPALIDAD_NOMBRE_DUPLICATE" }))
    ).toBe("Ya existe una municipalidad con ese nombre");
  });

  it("maps 404", () => {
    expect(mapMunicipalidadError(new ApiError(404, "Not Found"))).toBe(
      "La municipalidad no existe o fue eliminada"
    );
  });

  it("maps unknown errors to the connection message", () => {
    expect(mapMunicipalidadError(new ApiError(409, "Conflict", { error: "OTHER" }))).toBe(
      "Error de conexión. Por favor, intente de nuevo."
    );
    expect(mapMunicipalidadError(new Error("network"))).toBe(
      "Error de conexión. Por favor, intente de nuevo."
    );
  });
});
