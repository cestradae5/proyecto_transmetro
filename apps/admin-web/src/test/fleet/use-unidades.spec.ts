import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUnidades } from "../../features/fleet/hooks/use-unidades";
import { EstadoUnidad } from "../../features/fleet/types/fleet.types";
import type { Unidad } from "../../features/fleet/types/fleet.types";
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

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockPatch = vi.mocked(apiClient.patch);
const mockDelete = vi.mocked(apiClient.delete);

const SAMPLE_UNIDAD: Unidad = {
  idUnidad: "1",
  numeroPlaca: "P-123ABC",
  marca: "Volvo",
  modelo: "B8R",
  anio: 2024,
  capacidadPasajeros: 150,
  estadoUnidad: EstadoUnidad.DISPONIBLE,
  fechaRegistro: "2026-01-01T00:00:00.000Z",
  fechaActualizacion: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderLoaded() {
  mockGet.mockResolvedValue([SAMPLE_UNIDAD]);
  const hook = renderHook(() => useUnidades());
  await waitFor(() => {
    expect(hook.result.current.loading).toBe(false);
  });
  return hook;
}

describe("useUnidades", () => {
  it("fetches units on mount", async () => {
    mockGet.mockResolvedValue([SAMPLE_UNIDAD]);

    const { result } = renderHook(() => useUnidades());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGet).toHaveBeenCalledWith("/fleet/units");
    expect(result.current.items).toEqual([SAMPLE_UNIDAD]);
    expect(result.current.error).toBeNull();
  });

  it("sets translated error on fetch failure", async () => {
    mockGet.mockRejectedValue(
      new ApiError(404, "raw", { error: "UnitNotFound" })
    );

    const { result } = renderHook(() => useUnidades());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("La unidad no existe o fue eliminada");
    expect(result.current.items).toEqual([]);
  });

  it("createUnidad posts and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPost.mockResolvedValue({ ...SAMPLE_UNIDAD, idUnidad: "2" });

    const dto = {
      numeroPlaca: "P-999ZZZ",
      marca: "Volvo",
      modelo: "B8R",
      anio: 2024,
      capacidadPasajeros: 150,
    };
    let created: Unidad | undefined;
    await act(async () => {
      created = await result.current.createUnidad(dto);
    });

    expect(mockPost).toHaveBeenCalledWith("/fleet/units", dto);
    expect(created?.idUnidad).toBe("2");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("updateUnidad patches (also for status change) and refreshes", async () => {
    const { result } = await renderLoaded();
    mockPatch.mockResolvedValue({
      ...SAMPLE_UNIDAD,
      estadoUnidad: EstadoUnidad.MANTENIMIENTO,
    });

    let updated: Unidad | undefined;
    await act(async () => {
      updated = await result.current.updateUnidad("1", {
        estadoUnidad: EstadoUnidad.MANTENIMIENTO,
      });
    });

    expect(mockPatch).toHaveBeenCalledWith("/fleet/units/1", {
      estadoUnidad: EstadoUnidad.MANTENIMIENTO,
    });
    expect(updated?.estadoUnidad).toBe(EstadoUnidad.MANTENIMIENTO);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("deleteUnidad deletes and refreshes", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.deleteUnidad("1");
    });

    expect(mockDelete).toHaveBeenCalledWith("/fleet/units/1");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("refresh and mutations after the first load never render loading=true", async () => {
    mockGet.mockResolvedValue([SAMPLE_UNIDAD]);
    mockPost.mockResolvedValue({ ...SAMPLE_UNIDAD, idUnidad: "2" });
    const renders: boolean[] = [];
    const { result } = renderHook(() => {
      const value = useUnidades();
      renders.push(value.loading);
      return value;
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const afterFirstLoad = renders.length;

    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      await result.current.createUnidad({
        numeroPlaca: "P-999ZZZ",
        marca: "Volvo",
        modelo: "B8R",
        anio: 2024,
        capacidadPasajeros: 150,
      });
    });

    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(renders.slice(afterFirstLoad).every((l) => l === false)).toBe(true);
  });

  it("shows loading again on retry when the initial load failed", async () => {
    mockGet.mockRejectedValueOnce(new ApiError(500, "boom", {}));
    const renders: boolean[] = [];
    const { result } = renderHook(() => {
      const value = useUnidades();
      renders.push(value.loading);
      return value;
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    const before = renders.length;

    let release: (v: Unidad[]) => void = () => {};
    mockGet.mockReturnValue(new Promise<Unidad[]>((r) => (release = r)));
    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.refresh();
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      release([SAMPLE_UNIDAD]);
      await pending;
    });
    expect(result.current.loading).toBe(false);
    expect(renders.slice(before)).toContain(true);
    expect(result.current.items).toEqual([SAMPLE_UNIDAD]);
  });
  it("createUnidad rejects with translated message and skips refresh", async () => {
    const { result } = await renderLoaded();
    mockPost.mockRejectedValue(
      new ApiError(409, "raw backend text", { error: "DuplicatePlate" })
    );

    await expect(
      result.current.createUnidad({
        numeroPlaca: "P-123ABC",
        marca: "Volvo",
        modelo: "B8R",
        anio: 2024,
        capacidadPasajeros: 150,
      })
    ).rejects.toThrow("Ya existe una unidad con este número de placa");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("updateUnidad rejects with translated message", async () => {
    const { result } = await renderLoaded();
    mockPatch.mockRejectedValue(
      new ApiError(409, "raw", { error: "EnServicioRequiresBothAssignments" })
    );

    await expect(
      result.current.updateUnidad("1", { estadoUnidad: EstadoUnidad.EN_SERVICIO })
    ).rejects.toThrow(
      "Para poner la unidad En servicio debe tener línea y piloto asignados"
    );
  });

  it("deleteUnidad rejects with translated message", async () => {
    const { result } = await renderLoaded();
    mockDelete.mockRejectedValue(
      new ApiError(404, "raw", { error: "UnitNotFound" })
    );

    await expect(result.current.deleteUnidad("1")).rejects.toThrow(
      "La unidad no existe o fue eliminada"
    );
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});
