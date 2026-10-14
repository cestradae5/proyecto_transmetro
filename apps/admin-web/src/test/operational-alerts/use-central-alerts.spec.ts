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
import { useCentralAlerts } from "../../features/operational-alerts/hooks/use-central-alerts";
import type { Alerta, CentralAlerts } from "../../features/operational-alerts/types";

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
};

const PAYLOAD: CentralAlerts = {
  lineas: [
    {
      idLinea: "3",
      numeroLinea: "12",
      nombreLinea: "Línea 12",
      estaciones: [
        {
          idEstacion: "22",
          nombreEstacion: "Estación Centro",
          unidades: [{ idUnidad: "7", numeroPlaca: "P-123ABC", alerts: [ALERT] }],
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCentralAlerts", () => {
  it("loads the alerts of every station grouped by line", async () => {
    mockGet.mockResolvedValue(PAYLOAD);

    const { result } = renderHook(() => useCentralAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/operations/alerts/central");
    expect(result.current.data).toEqual(PAYLOAD);
    expect(result.current.error).toBeNull();
  });

  it("exposes load errors as a message", async () => {
    mockGet.mockRejectedValue(new ApiError(500, "Internal server error", {}));

    const { result } = renderHook(() => useCentralAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Internal server error");
  });

  it("updateStatus patches the central route with the exact body and refreshes", async () => {
    mockGet.mockResolvedValue(PAYLOAD);
    mockPatch.mockResolvedValue({ ...ALERT, estadoAlerta: "RECIBIDA" });
    const { result } = renderHook(() => useCentralAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated: CentralAlerts = {
      lineas: [
        {
          ...PAYLOAD.lineas[0]!,
          estaciones: [
            {
              ...PAYLOAD.lineas[0]!.estaciones[0]!,
              unidades: [{ idUnidad: "7", numeroPlaca: "P-123ABC", alerts: [{ ...ALERT, estadoAlerta: "RECIBIDA" }] }],
            },
          ],
        },
      ],
    };
    mockGet.mockResolvedValue(updated);
    await act(async () => {
      await result.current.updateStatus("100", "RECIBIDA", "  Central atiende  ");
    });

    expect(mockPatch).toHaveBeenCalledWith("/operations/alerts/central/100/status", {
      estado: "RECIBIDA",
      observacion: "Central atiende",
    });
    expect(result.current.data).toEqual(updated);
  });

  it("updateStatus omits a blank observation", async () => {
    mockGet.mockResolvedValue(PAYLOAD);
    mockPatch.mockResolvedValue({ ...ALERT, estadoAlerta: "RESUELTA" });
    const { result } = renderHook(() => useCentralAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateStatus("100", "RESUELTA", "   ");
    });

    expect(mockPatch).toHaveBeenCalledWith("/operations/alerts/central/100/status", { estado: "RESUELTA" });
  });

  it("updateStatus rethrows the backend error with a Spanish message", async () => {
    mockGet.mockResolvedValue(PAYLOAD);
    mockPatch.mockRejectedValue(new ApiError(409, "x", { error: "InvalidAlertTransition" }));
    const { result } = renderHook(() => useCentralAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.updateStatus("100", "RECIBIDA")).rejects.toThrow(
        "La alerta ya cambió de estado. Actualice la lista e intente de nuevo",
      );
    });
  });

  it("polls every POLL_INTERVAL_MS without flashing loading, and stops on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue(PAYLOAD);
    const { result, unmount } = renderHook(() => useCentralAlerts());
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
