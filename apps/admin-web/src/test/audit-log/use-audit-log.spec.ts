import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuditLog, useAuditLogOptions } from "../../features/audit-log/hooks/use-audit-log";
import { ApiError } from "../../lib/api-client";
import { ENTRY, page } from "./fixtures";

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

import { apiClient } from "../../lib/api-client";

const mockGet = vi.mocked(apiClient.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAuditLog", () => {
  it("loads the first page without filters", async () => {
    mockGet.mockResolvedValue(page([ENTRY]));
    const { result } = renderHook(() => useAuditLog({}, 1));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGet).toHaveBeenCalledWith("/audit-log?page=1&pageSize=20");
    expect(result.current.data?.items).toEqual([ENTRY]);
    expect(result.current.error).toBeNull();
  });

  it("sends only non-empty filters and the requested page", async () => {
    mockGet.mockResolvedValue(page([]));
    renderHook(() =>
      useAuditLog(
        { from: "2026-01-01", to: "2026-01-31", user: "  ana ", module: "fleet", action: "", result: "FALLIDO" },
        3,
      ),
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith(
      "/audit-log?from=2026-01-01&to=2026-01-31&user=ana&module=fleet&result=FALLIDO&page=3&pageSize=20",
    );
  });

  it("maps a 403 to a permission message", async () => {
    mockGet.mockRejectedValue(new ApiError(403, "Forbidden"));
    const { result } = renderHook(() => useAuditLog({}, 1));

    await waitFor(() => expect(result.current.error).toBe("No tiene permiso para consultar la bitácora."));
    expect(result.current.data).toBeNull();
  });

  it("reports a network failure as a connection problem", async () => {
    mockGet.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useAuditLog({}, 1));

    await waitFor(() =>
      expect(result.current.error).toBe("No se pudo conectar con el servidor. Intente de nuevo."),
    );
  });
});

describe("useAuditLogOptions", () => {
  it("loads modules and actions", async () => {
    mockGet.mockResolvedValue({ modules: ["fleet"], actions: ["LOGIN"] });
    const { result } = renderHook(() => useAuditLogOptions());

    await waitFor(() => expect(result.current.modules).toEqual(["fleet"]));
    expect(result.current.actions).toEqual(["LOGIN"]);
    expect(mockGet).toHaveBeenCalledWith("/audit-log/options");
  });

  it("falls back to empty lists when options fail", async () => {
    mockGet.mockRejectedValue(new ApiError(500, "boom"));
    const { result } = renderHook(() => useAuditLogOptions());

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current.modules).toEqual([]);
    expect(result.current.actions).toEqual([]);
  });
});
