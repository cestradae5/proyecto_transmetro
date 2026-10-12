import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuditLogPage } from "../../features/audit-log";
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

function routeGet(listResponse: unknown) {
  mockGet.mockImplementation(async (path: string) => {
    if (path === "/audit-log/options") return { modules: ["authentication", "fleet"], actions: ["LOGIN", "assign_pilot"] };
    return listResponse;
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditLogPage />
    </MemoryRouter>,
  );
}

const listCalls = () => mockGet.mock.calls.map(([p]) => p as string).filter((p) => p.startsWith("/audit-log?"));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuditLogPage", () => {
  it("lists entries with the total and filter options", async () => {
    routeGet(page([ENTRY], { total: 1 }));
    renderPage();

    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bitácora (1)" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Autenticación" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "assign_pilot" })).toBeInTheDocument();
  });

  it("refetches from page 1 when a filter changes", async () => {
    routeGet(page([ENTRY], { total: 45 }));
    renderPage();
    await screen.findByText("Ana Pérez");

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(listCalls().at(-1)).toContain("page=2"));

    fireEvent.change(await screen.findByLabelText("Módulo"), { target: { value: "fleet" } });
    await waitFor(() => expect(listCalls().at(-1)).toBe("/audit-log?module=fleet&page=1&pageSize=20"));
  });

  it("debounces the user filter and sends it trimmed", async () => {
    routeGet(page([ENTRY]));
    renderPage();
    await screen.findByText("Ana Pérez");
    const before = listCalls().length;

    fireEvent.change(screen.getByLabelText("Usuario"), { target: { value: " ana " } });
    expect(listCalls()).toHaveLength(before);
    await waitFor(() => expect(listCalls().at(-1)).toBe("/audit-log?user=ana&page=1&pageSize=20"));
  });

  it("disables pagination at the edges", async () => {
    routeGet(page([ENTRY], { total: 1 }));
    renderPage();
    await screen.findByText("Ana Pérez");

    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
  });

  it("clears filters", async () => {
    routeGet(page([ENTRY]));
    renderPage();
    await screen.findByText("Ana Pérez");

    fireEvent.change(screen.getByLabelText("Resultado"), { target: { value: "FALLIDO" } });
    await waitFor(() => expect(listCalls().at(-1)).toContain("result=FALLIDO"));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => expect(listCalls().at(-1)).toBe("/audit-log?page=1&pageSize=20"));
  });

  it("opens and closes the detail dialog", async () => {
    routeGet(page([ENTRY]));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Ver detalle" }));

    expect(screen.getByRole("dialog", { name: "Detalle del registro #10" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the load error", async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === "/audit-log/options") return { modules: [], actions: [] };
      throw new TypeError("Failed to fetch");
    });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar con el servidor");
  });
});
