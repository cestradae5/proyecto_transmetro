import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAsignacionPiloto } from "../../features/fleet/hooks/use-asignacion-piloto";
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
  id: "10",
  idEmpleado: "e1",
  idUnidad: "1",
  fechaAsignacion: "2026-01-01",
  fechaActualizacion: "2026-01-01",
};

beforeEach(() => vi.clearAllMocks());

describe("useAsignacionPiloto", () => {
  it("assignPilot posts the employee id and does not refetch", async () => {
    mockPost.mockResolvedValue(ASIGNACION);
    const { assignPilot } = useAsignacionPiloto();

    await expect(assignPilot("1", "e1")).resolves.toEqual(ASIGNACION);
    expect(mockPost).toHaveBeenCalledWith("/fleet/units/1/pilot-assignment", { idEmpleado: "e1" });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("reassignPilot patches the target unit path with the moved pilot", async () => {
    mockPatch.mockResolvedValue({ ...ASIGNACION, idUnidad: "2" });
    const { reassignPilot } = useAsignacionPiloto();

    await expect(reassignPilot("2", "e1")).resolves.toMatchObject({ idUnidad: "2" });
    expect(mockPatch).toHaveBeenCalledWith("/fleet/units/2/pilot-assignment", { idEmpleado: "e1" });
  });

  it("unassignPilot deletes and resolves null", async () => {
    mockDelete.mockResolvedValue(null);
    const { unassignPilot } = useAsignacionPiloto();

    await expect(unassignPilot("1")).resolves.toBeNull();
    expect(mockDelete).toHaveBeenCalledWith("/fleet/units/1/pilot-assignment");
  });

  it("assignPilot maps errors", async () => {
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "PilotAlreadyAssignedToUnit" }));
    await expect(useAsignacionPiloto().assignPilot("1", "e1")).rejects.toThrow(
      "El piloto ya está asignado a otra unidad"
    );
  });

  it("reassignPilot maps errors", async () => {
    mockPatch.mockRejectedValue(new ApiError(409, "raw", { error: "UnitEnServicioCannotReassignPilot" }));
    await expect(useAsignacionPiloto().reassignPilot("1", "e1")).rejects.toThrow(
      "No se puede reasignar el piloto de una unidad En servicio"
    );
  });

  it("unassignPilot maps errors", async () => {
    mockDelete.mockRejectedValue(new ApiError(409, "raw", { error: "UnitEnServicioCannotUnassignPilot" }));
    await expect(useAsignacionPiloto().unassignPilot("1")).rejects.toThrow(
      "No se puede quitar el piloto a una unidad En servicio"
    );
  });
});
