import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUbicacionUnidad } from "../../features/fleet/hooks/use-ubicacion-unidad";
import { ApiError } from "../../lib/api-client";

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

const mockPost = vi.mocked(apiClient.post);
const mockPatch = vi.mocked(apiClient.patch);

const RESULT = {
  id: "10",
  idUnidad: "1",
  idLinea: "4",
  fechaAsignacion: "2026-01-01",
  fechaActualizacion: "2026-01-01",
  idLineaParadaActual: "33",
  fechaReporteUbicacion: "2026-01-02T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useUbicacionUnidad", () => {
  it("reportLocation posts the line-stop id to the location path", async () => {
    mockPost.mockResolvedValue(RESULT);
    await expect(useUbicacionUnidad().reportLocation("1", "33")).resolves.toEqual(RESULT);
    expect(mockPost).toHaveBeenCalledWith("/fleet/units/1/location", { idLineaParada: "33" });
  });

  it("correctLocation patches the same path", async () => {
    mockPatch.mockResolvedValue(RESULT);
    await expect(useUbicacionUnidad().correctLocation("1", "34")).resolves.toEqual(RESULT);
    expect(mockPatch).toHaveBeenCalledWith("/fleet/units/1/location", { idLineaParada: "34" });
  });

  it("reportLocation maps errors", async () => {
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "StopNotInAssignedLine" }));
    await expect(useUbicacionUnidad().reportLocation("1", "33")).rejects.toThrow(
      "La parada no pertenece a la línea asignada a la unidad"
    );
  });

  it("correctLocation maps errors", async () => {
    mockPatch.mockRejectedValue(new ApiError(409, "raw", { error: "UnitHasNoLineAssignment" }));
    await expect(useUbicacionUnidad().correctLocation("1", "33")).rejects.toThrow(
      "La unidad no tiene una línea asignada"
    );
  });
});
