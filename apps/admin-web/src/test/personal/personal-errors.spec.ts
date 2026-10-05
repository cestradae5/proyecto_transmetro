import { describe, it, expect, vi } from "vitest";

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

import { ApiError } from "../../lib/api-client";
import {
  getPersonalErrorMessage,
  mapPersonalError,
} from "../../features/personal/hooks/personal-errors";

const body = (statusCode: number, message: unknown) => ({
  statusCode,
  message,
  error: "x",
});

describe("getPersonalErrorMessage", () => {
  it("400 uses the backend string message", () => {
    const err = new ApiError(400, "raw", body(400, "El DPI debe tener 13 dígitos"));
    expect(getPersonalErrorMessage(err)).toBe("El DPI debe tener 13 dígitos");
  });

  it("400 joins an array message", () => {
    const err = new ApiError(400, "raw", body(400, ["Uno inválido", "Dos inválido"]));
    expect(getPersonalErrorMessage(err)).toBe("Uno inválido. Dos inválido");
  });

  it("400 falls back to a generic message without body message", () => {
    expect(getPersonalErrorMessage(new ApiError(400, "raw", {}))).toBe(
      "Los datos enviados no son válidos. Revise el formulario."
    );
  });

  it("401 and 403 map to the permission/session message", () => {
    const expected =
      "No tiene permiso para realizar esta acción o su sesión expiró.";
    expect(getPersonalErrorMessage(new ApiError(401, "raw"))).toBe(expected);
    expect(getPersonalErrorMessage(new ApiError(403, "raw"))).toBe(expected);
  });

  it("404 maps to employee not found", () => {
    expect(getPersonalErrorMessage(new ApiError(404, "raw"))).toBe(
      "El empleado no existe o fue eliminado."
    );
  });

  it("409 uses the backend message", () => {
    const err = new ApiError(409, "raw", body(409, "Desactive al empleado en su lugar"));
    expect(getPersonalErrorMessage(err)).toBe("Desactive al empleado en su lugar");
  });

  it("409 falls back to a generic conflict message", () => {
    expect(getPersonalErrorMessage(new ApiError(409, "raw", {}))).toBe(
      "La operación genera un conflicto con datos existentes."
    );
  });

  it("other statuses map to a generic message", () => {
    expect(getPersonalErrorMessage(new ApiError(500, "raw", body(500, "boom")))).toBe(
      "Ocurrió un error inesperado. Por favor, intente de nuevo."
    );
  });

  it("non-ApiError maps to the connection message", () => {
    expect(getPersonalErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Error de conexión. Por favor, intente de nuevo."
    );
  });
});

describe("mapPersonalError", () => {
  it("rethrows a plain Error with the translated message", () => {
    const err = new ApiError(404, "raw");
    let thrown: unknown;
    try {
      mapPersonalError(err);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(ApiError);
    expect((thrown as Error).message).toBe("El empleado no existe o fue eliminado.");
  });
});
