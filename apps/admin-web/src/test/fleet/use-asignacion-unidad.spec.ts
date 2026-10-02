import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAsignacionUnidad } from "../../features/fleet/hooks/use-asignacion-unidad";
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
const mockDelete = vi.mocked(apiClient.delete);

const ASIGNACION = {
  id: "10",
  idUnidad: "1",
  idLinea: "4",
  fechaAsignacion: "2026-01-01",
  fechaActualizacion: "2026-01-01",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAsignacionUnidad", () => {
  it("assignLine posts the line id to the unit line-assignment path", async () => {
    mockPost.mockResolvedValue(ASIGNACION);
    const { assignLine } = useAsignacionUnidad();

    await expect(assignLine("1", "4")).resolves.toEqual(ASIGNACION);
    expect(mockPost).toHaveBeenCalledWith("/fleet/units/1/line-assignment", { idLinea: "4" });
  });

  it("reassignLine patches the same path", async () => {
    mockPatch.mockResolvedValue({ ...ASIGNACION, idLinea: "5" });
    const { reassignLine } = useAsignacionUnidad();

    await expect(reassignLine("1", "5")).resolves.toMatchObject({ idLinea: "5" });
    expect(mockPatch).toHaveBeenCalledWith("/fleet/units/1/line-assignment", { idLinea: "5" });
  });

  it("unassignLine deletes and resolves null", async () => {
    mockDelete.mockResolvedValue(null);
    const { unassignLine } = useAsignacionUnidad();

    await expect(unassignLine("1")).resolves.toBeNull();
    expect(mockDelete).toHaveBeenCalledWith("/fleet/units/1/line-assignment");
  });

  it("assignLine maps errors", async () => {
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "UnitAlreadyHasLineAssignment" }));
    await expect(useAsignacionUnidad().assignLine("1", "4")).rejects.toThrow(
      "La unidad ya tiene una línea asignada"
    );
  });

  it("reassignLine maps errors", async () => {
    mockPatch.mockRejectedValue(new ApiError(409, "raw", { error: "LineAssignmentUnchanged" }));
    await expect(useAsignacionUnidad().reassignLine("1", "4")).rejects.toThrow(
      "La unidad ya está asignada a esa línea"
    );
  });

  it("unassignLine maps errors", async () => {
    mockDelete.mockRejectedValue(new ApiError(409, "raw", { error: "UnitEnServicioCannotUnassignLine" }));
    await expect(useAsignacionUnidad().unassignLine("1")).rejects.toThrow(
      "No se puede quitar la línea a una unidad En servicio"
    );
  });
});
