import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/api-client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public data?: any,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

import { apiClient, ApiError } from "../../lib/api-client";
import { POLL_INTERVAL_MS } from "../../features/operational-alerts/constants";
import { useStationAlerts } from "../../features/operational-alerts/hooks/use-station-alerts";
import type { Alerta, StationAlerts } from "../../features/operational-alerts/types";

const mockGet = vi.mocked(apiClient.get);
const mockPatch = vi.mocked(apiClient.patch);

const ALERT: Alerta = {
  idAlerta: "100",
  tipoAlerta: "ACCIDENTE",
  tipoOrigen: "UNIDAD",
  tipoDestino: "ESTACION",
  estadoAlerta: "PENDIENTE",
  fechaCreacion: "2026-10-13T10:00:00.000Z",
  fechaActualizacion: "2026-10-13T10:00:00.000Z",
  unidad: { idUnidad: "7", numeroPlaca: "P-123ABC" },
  estacionDestino: { idEstacion: "22", nombreEstacion: "Estación Centro" },
  autor: { idEmpleado: "5", nombre: "Piloto Uno" },
  observaciones: [],
  linea: { idLinea: "3", numeroLinea: "12", nombreLinea: "Línea 12" },
};

const PAYLOAD: StationAlerts = {
  station: { idEstacion: "22", nombreEstacion: "Estación Centro" },
  lineas: [
    { idLinea: "3", numeroLinea: "12", nombreLinea: "Línea 12" },
    { idLinea: "6", numeroLinea: "6", nombreLinea: "Línea 6" },
  ],
  alerts: [ALERT],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useStationAlerts", () => {
  it("loads the operator's station and its alerts", async () => {
    mockGet.mockResolvedValue(PAYLOAD);

    const { result } = renderHook(() => useStationAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/operations/alerts/my-station");
    expect(result.current.data).toEqual(PAYLOAD);
    expect(result.current.lineFilter).toBeNull();
    expect(result.current.noStation).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("filters by line server side and keeps the filter while polling (S6)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue(PAYLOAD);
    const { result } = renderHook(() => useStationAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.setLineFilter("6");
    });
    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith("/operations/alerts/my-station?idLinea=6"));
    expect(result.current.lineFilter).toBe("6");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(mockGet).toHaveBeenLastCalledWith("/operations/alerts/my-station?idLinea=6");

    await act(async () => {
      result.current.setLineFilter(null);
    });
    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith("/operations/alerts/my-station"));
    expect(result.current.lineFilter).toBeNull();
  });

  it("flags noStation when the operator has no station (OperatorHasNoStation)", async () => {
    mockGet.mockRejectedValue(new ApiError(404, "x", { error: "OperatorHasNoStation" }));

    const { result } = renderHook(() => useStationAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.noStation).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("exposes other load errors as a message", async () => {
    mockGet.mockRejectedValue(new ApiError(500, "Internal server error", {}));

    const { result } = renderHook(() => useStationAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Internal server error");
  });

  it("updateStatus patches the exact body (trimmed observation) and refreshes", async () => {
    mockGet.mockResolvedValue(PAYLOAD);
    mockPatch.mockResolvedValue({ ...ALERT, estadoAlerta: "RECIBIDA" });
    const { result } = renderHook(() => useStationAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = { ...PAYLOAD, alerts: [{ ...ALERT, estadoAlerta: "RECIBIDA" as const }] };
    mockGet.mockResolvedValue(updated);
    await act(async () => {
      await result.current.updateStatus("100", "RECIBIDA", "  En camino  ");
    });

    expect(mockPatch).toHaveBeenCalledWith("/operations/alerts/100/status", {
      estado: "RECIBIDA",
      observacion: "En camino",
    });
    expect(result.current.data).toEqual(updated);
  });

  it("updateStatus omits a blank observation", async () => {
    mockGet.mockResolvedValue(PAYLOAD);
    mockPatch.mockResolvedValue({ ...ALERT, estadoAlerta: "RESUELTA" });
    const { result } = renderHook(() => useStationAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStatus("100", "RESUELTA", "   ");
    });

    expect(mockPatch).toHaveBeenCalledWith("/operations/alerts/100/status", { estado: "RESUELTA" });
  });

  it("updateStatus rethrows the backend error with a Spanish message", async () => {
    mockGet.mockResolvedValue(PAYLOAD);
    mockPatch.mockRejectedValue(new ApiError(409, "x", { error: "InvalidAlertTransition" }));
    const { result } = renderHook(() => useStationAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateStatus("100", "RECIBIDA")).rejects.toThrow(
        "La alerta ya cambió de estado. Actualice la lista e intente de nuevo",
      );
    });
  });

  it("polls the station alerts every POLL_INTERVAL_MS without flashing loading, and stops on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue(PAYLOAD);
    const { result, unmount } = renderHook(() => useStationAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);

    unmount();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
