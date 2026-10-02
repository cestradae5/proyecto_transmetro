import { describe, it, expect, vi } from "vitest";
import { mapFleetError, getFleetErrorMessage } from "../../features/fleet/hooks/fleet-errors";
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

const CASES: Array<[string, string]> = [
  ["UnitNotFound", "La unidad no existe o fue eliminada"],
  ["LineNotFound", "La línea no existe"],
  ["EmployeeNotFound", "El empleado no existe"],
  ["StopNotFound", "La parada no existe"],
  ["LineAssignmentNotFound", "La unidad no tiene una asignación de línea"],
  ["PilotAssignmentNotFound", "La unidad no tiene un piloto asignado"],
  ["DuplicatePlate", "Ya existe una unidad con este número de placa"],
  ["UnitCannotBeCreatedEnServicio", "Una unidad no puede crearse en estado En servicio"],
  ["EnServicioRequiresBothAssignments", "Para poner la unidad En servicio debe tener línea y piloto asignados"],
  ["UnitAlreadyHasLineAssignment", "La unidad ya tiene una línea asignada"],
  ["LineAssignmentUnchanged", "La unidad ya está asignada a esa línea"],
  ["UnitEnServicioCannotUnassignLine", "No se puede quitar la línea a una unidad En servicio"],
  ["StopNotInAssignedLine", "La parada no pertenece a la línea asignada a la unidad"],
  ["UnitHasNoLineAssignment", "La unidad no tiene una línea asignada"],
  ["PilotRoleRequired", "El empleado seleccionado no tiene el rol de piloto"],
  ["PilotAlreadyAssignedToUnit", "El piloto ya está asignado a otra unidad"],
  ["UnitAlreadyHasPilotAssignment", "La unidad ya tiene un piloto asignado"],
  ["PilotAssignmentUnchanged", "La unidad ya tiene asignado a ese piloto"],
  ["UnitEnServicioCannotReassignPilot", "No se puede reasignar el piloto de una unidad En servicio"],
  ["UnitEnServicioCannotUnassignPilot", "No se puede quitar el piloto a una unidad En servicio"],
];

describe("mapFleetError", () => {
  it.each(CASES)("maps %s to its Spanish message", (code, message) => {
    const err = new ApiError(409, "raw backend text", { error: code });
    expect(() => mapFleetError(err)).toThrow(new Error(message));
    expect(getFleetErrorMessage(err)).toBe(message);
  });

  it("falls back to err.message for unknown error classes", () => {
    const err = new ApiError(400, "Texto del backend", { error: "SomethingElse" });
    expect(() => mapFleetError(err)).toThrow("Texto del backend");
  });

  it("falls back to err.message for plain errors", () => {
    expect(() => mapFleetError(new Error("network"))).toThrow("network");
  });

  it("uses a connection message for non-Error values", () => {
    expect(() => mapFleetError("boom")).toThrow(
      "Error de conexión. Por favor, intente de nuevo."
    );
  });

  it("throws an Error instance", () => {
    try {
      mapFleetError(new ApiError(404, "x", { error: "UnitNotFound" }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(ApiError);
    }
  });
});
