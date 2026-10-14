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
import { usePilotAlerts } from "../../features/operational-alerts/hooks/use-pilot-alerts";
import type { Alerta, AlertaDestinations } from "../../features/operational-alerts/types";

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

const DESTINATIONS: AlertaDestinations = {
  unidad: { idUnidad: "7", numeroPlaca: "P-123ABC" },
  linea: { idLinea: "3", numeroLinea: "12", nombreLinea: "Línea 12" },
  destinations: [
    { idEstacion: "21", nombreEstacion: "Estación Norte", orden: 1, suggested: false },
    { idEstacion: "22", nombreEstacion: "Estación Centro", orden: 3, suggested: true },
  ],
};

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

function routeGets(destinations: unknown, sent: unknown) {
  mockGet.mockImplementation(async (path: string) => {
    if (path === "/operations/alerts/my-unit/destinations") {
      if (destinations instanceof Error) throw destinations;
      return destinations;
    }
    if (path === "/operations/alerts/sent") {
      if (sent instanceof Error) throw sent;
      return sent;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePilotAlerts", () => {
  it("loads the destinations and the sent alerts", async () => {
    routeGets(DESTINATIONS, [ALERT]);

    const { result } = renderHook(() => usePilotAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.destinations).toEqual(DESTINATIONS);
    expect(result.current.sent).toEqual([ALERT]);
    expect(result.current.noUnit).toBe(false);
    expect(result.current.noLine).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("flags noUnit when the pilot has no unit (PilotHasNoUnitAssigned)", async () => {
    routeGets(new ApiError(404, "x", { error: "PilotHasNoUnitAssigned" }), []);

    const { result } = renderHook(() => usePilotAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.noUnit).toBe(true);
    expect(result.current.destinations).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("flags noLine when the unit has no line (UnitHasNoLine)", async () => {
    routeGets(new ApiError(404, "x", { error: "UnitHasNoLine" }), []);

    const { result } = renderHook(() => usePilotAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.noLine).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("exposes other load errors as a message", async () => {
    routeGets(new ApiError(500, "Internal server error", {}), []);

    const { result } = renderHook(() => usePilotAlerts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Internal server error");
  });

  it("sendAlert posts the exact body and refreshes the sent list", async () => {
    routeGets(DESTINATIONS, []);
    mockPost.mockResolvedValue(ALERT);
    const { result } = renderHook(() => usePilotAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    routeGets(DESTINATIONS, [ALERT]);
    await act(async () => {
      await expect(result.current.sendAlert("ACCIDENTE", "22")).resolves.toEqual(ALERT);
    });

    expect(mockPost).toHaveBeenCalledWith("/operations/alerts", {
      tipoAlerta: "ACCIDENTE",
      idEstacionDestino: "22",
    });
    expect(result.current.sent).toEqual([ALERT]);
  });

  it("sendAlert rethrows the backend error with a Spanish message", async () => {
    routeGets(DESTINATIONS, []);
    mockPost.mockRejectedValue(new ApiError(400, "x", { error: "DestinationNotOnLine" }));
    const { result } = renderHook(() => usePilotAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.sendAlert("ACCIDENTE", "99")).rejects.toThrow(
        "La estación de destino no pertenece a la línea de la unidad",
      );
    });
  });

  it("polls the sent alerts every POLL_INTERVAL_MS and stops on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    routeGets(DESTINATIONS, []);
    const { result, unmount } = renderHook(() => usePilotAlerts());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const sentCalls = () =>
      mockGet.mock.calls.filter(([path]) => path === "/operations/alerts/sent").length;
    expect(sentCalls()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(sentCalls()).toBe(2);

    unmount();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(sentCalls()).toBe(2);
  });
});
