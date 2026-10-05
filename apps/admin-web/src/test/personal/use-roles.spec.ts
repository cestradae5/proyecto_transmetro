import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useRoles } from "../../features/personal/hooks/use-roles";
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

const ROLES = [
  { id: "1", code: "PILOTO", name: "Piloto" },
  { id: "2", code: "OPERADOR_CENTRAL", name: "Operador central" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useRoles", () => {
  it("loads roles from /personal/roles", async () => {
    mockGet.mockResolvedValue(ROLES);

    const { result } = renderHook(() => useRoles());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockGet).toHaveBeenCalledWith("/personal/roles");
    expect(result.current.roles).toEqual(ROLES);
    expect(result.current.error).toBeNull();
  });

  it("exposes a translated error on failure", async () => {
    mockGet.mockRejectedValue(new ApiError(403, "raw", {}));

    const { result } = renderHook(() => useRoles());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(
      "No tiene permiso para realizar esta acción o su sesión expiró."
    );
    expect(result.current.roles).toEqual([]);
  });
});
