import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEmpleados } from "../../features/personal/hooks/use-empleados";
import type {
  Empleado,
  EmpleadoFilters,
} from "../../features/personal/types/personal.types";
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

const EMPLEADO: Empleado = {
  id: "1",
  name: "Ana López",
  email: "ana@transmetro.test",
  status: "ACTIVO",
  roleId: "2",
  roleCode: "PILOTO",
  roleName: "Piloto",
  phone: null,
  dpi: "1234567890123",
  hireDate: null,
  address: null,
  licenseNumber: null,
  educationHistory: null,
  languages: null,
};

const CREATE_PAYLOAD = {
  name: "Ana López",
  email: "ana@transmetro.test",
  roleId: "2",
  dpi: "1234567890123",
};

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderLoaded(filters?: EmpleadoFilters) {
  mockGet.mockResolvedValue([EMPLEADO]);
  const hook = renderHook(({ f }) => useEmpleados(f), {
    initialProps: { f: filters },
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useEmpleados", () => {
  it("fetches employees on mount without query string", async () => {
    mockGet.mockResolvedValue([EMPLEADO]);

    const { result } = renderHook(() => useEmpleados());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockGet).toHaveBeenCalledWith("/personal/empleados");
    expect(result.current.items).toEqual([EMPLEADO]);
    expect(result.current.error).toBeNull();
  });

  it("sends filters as query params", async () => {
    await renderLoaded({ search: "ana lópez", status: "ACTIVO", roleId: "2" });

    const path = mockGet.mock.calls[0]?.[0] as string;
    const [base, query] = path.split("?");
    expect(base).toBe("/personal/empleados");
    const params = new URLSearchParams(query);
    expect(params.get("search")).toBe("ana lópez");
    expect(params.get("status")).toBe("ACTIVO");
    expect(params.get("roleId")).toBe("2");
  });

  it("omits empty filter values", async () => {
    await renderLoaded({ search: "   ", status: undefined, roleId: "" });

    expect(mockGet).toHaveBeenCalledWith("/personal/empleados");
  });

  it("refetches when filters change", async () => {
    const { result, rerender } = await renderLoaded({ status: "ACTIVO" });
    expect(mockGet).toHaveBeenCalledTimes(1);

    mockGet.mockResolvedValue([]);
    rerender({ f: { status: "INACTIVO" } });

    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenLastCalledWith("/personal/empleados?status=INACTIVO");
  });

  it("does not refetch when filters are re-created with the same values", async () => {
    const { rerender } = await renderLoaded({ status: "ACTIVO" });

    rerender({ f: { status: "ACTIVO" } });

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("ignores stale responses from superseded requests", async () => {
    let releaseFirst: (v: Empleado[]) => void = () => {};
    const stale = { ...EMPLEADO, id: "stale" };
    const fresh = { ...EMPLEADO, id: "fresh" };
    mockGet
      .mockReturnValueOnce(new Promise<Empleado[]>((r) => (releaseFirst = r)))
      .mockResolvedValueOnce([fresh]);

    const { result, rerender } = renderHook(({ f }) => useEmpleados(f), {
      initialProps: { f: { search: "a" } as EmpleadoFilters },
    });
    rerender({ f: { search: "ab" } });

    await waitFor(() => expect(result.current.items).toEqual([fresh]));

    await act(async () => {
      releaseFirst([stale]);
    });

    expect(result.current.items).toEqual([fresh]);
    expect(result.current.loading).toBe(false);
  });

  it("sets a translated error on fetch failure", async () => {
    mockGet.mockRejectedValue(new ApiError(403, "raw", {}));

    const { result } = renderHook(() => useEmpleados());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(
      "No tiene permiso para realizar esta acción o su sesión expiró."
    );
    expect(result.current.items).toEqual([]);
  });

  it("create posts and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPost.mockResolvedValue({ ...EMPLEADO, id: "2" });

    let created: Empleado | undefined;
    await act(async () => {
      created = await result.current.create(CREATE_PAYLOAD);
    });

    expect(mockPost).toHaveBeenCalledWith("/personal/empleados", CREATE_PAYLOAD);
    expect(created?.id).toBe("2");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("update patches and refreshes keeping current filters", async () => {
    const { result } = await renderLoaded({ status: "ACTIVO" });
    mockPatch.mockResolvedValue({ ...EMPLEADO, status: "INACTIVO" });

    await act(async () => {
      await result.current.update("1", { status: "INACTIVO" });
    });

    expect(mockPatch).toHaveBeenCalledWith("/personal/empleados/1", {
      status: "INACTIVO",
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenLastCalledWith("/personal/empleados?status=ACTIVO");
  });

  it("delete deletes (204 -> null) and refreshes", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockResolvedValue(null);

    await act(async () => {
      await result.current.delete("1");
    });

    expect(mockDelete).toHaveBeenCalledWith("/personal/empleados/1");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("refresh and mutations after the first load never render loading=true", async () => {
    mockGet.mockResolvedValue([EMPLEADO]);
    mockPost.mockResolvedValue(EMPLEADO);
    const renders: boolean[] = [];
    const { result } = renderHook(() => {
      const value = useEmpleados();
      renders.push(value.loading);
      return value;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const afterFirstLoad = renders.length;

    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      await result.current.create(CREATE_PAYLOAD);
    });

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(renders.slice(afterFirstLoad).every((l) => l === false)).toBe(true);
  });

  it("create rejects with the backend message on 409 and skips refresh", async () => {
    const { result } = await renderLoaded();
    mockPost.mockRejectedValue(
      new ApiError(409, "raw", { statusCode: 409, message: "El correo ya está registrado" })
    );

    await expect(result.current.create(CREATE_PAYLOAD)).rejects.toThrow(
      "El correo ya está registrado"
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("update rejects with the 404 message", async () => {
    const { result } = await renderLoaded();
    mockPatch.mockRejectedValue(new ApiError(404, "raw", {}));

    await expect(result.current.update("9", { name: "X" })).rejects.toThrow(
      "El empleado no existe o fue eliminado."
    );
  });

  it("delete rejects with the 409 'deactivate instead' message", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockRejectedValue(
      new ApiError(409, "raw", {
        statusCode: 409,
        message: "El empleado tiene historial; desactívelo en su lugar",
      })
    );

    await expect(result.current.delete("1")).rejects.toThrow(
      "El empleado tiene historial; desactívelo en su lugar"
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
