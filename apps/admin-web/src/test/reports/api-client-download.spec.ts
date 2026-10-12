import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient, ApiError } from "../../lib/api-client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem("transmetro_token", "jwt-123");
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  fetchMock.mockReset();
});

describe("apiClient.download", () => {
  it("returns the body as a Blob with the server file name, sending the bearer token", async () => {
    fetchMock.mockResolvedValue(
      // String body: jsdom's Blob is not understood by the native Response.
      new Response("%PDF-1", {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="reporte-flota-2026-01-15.pdf"' },
      }),
    );

    const file = await apiClient.download("/reports/fleet");

    expect(file.fileName).toBe("reporte-flota-2026-01-15.pdf");
    expect(await file.blob.text()).toBe("%PDF-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/reports\/fleet$/);
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer jwt-123" });
  });

  it("falls back to the given name when the header is missing", async () => {
    fetchMock.mockResolvedValue(new Response("x", { status: 200 }));
    expect((await apiClient.download("/reports/fleet", "reporte.pdf")).fileName).toBe("reporte.pdf");
  });

  it("throws ApiError with the server message on failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(apiClient.download("/reports/fleet")).rejects.toMatchObject({ status: 403, message: "Forbidden" });
    await expect(apiClient.download("/reports/fleet")).rejects.toBeInstanceOf(ApiError);
  });
});
