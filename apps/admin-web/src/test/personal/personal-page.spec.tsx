import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Empleado, PersonalRole } from "../../features/personal/types/personal.types";

vi.mock("../../lib/api-client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public data?: unknown,
    ) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

import { apiClient } from "../../lib/api-client";
import { PersonalPage } from "../../features/personal";

const mockGet = vi.mocked(apiClient.get);

const ROLES: PersonalRole[] = [
  { id: "1", code: "OPERADOR_CENTRAL", name: "Operador Central" },
  { id: "2", code: "PILOTO", name: "Piloto" },
];

function empleado(overrides: Partial<Empleado> = {}): Empleado {
  return {
    id: "1",
    name: "Ana López",
    email: "ana@transmetro.test",
    status: "ACTIVO",
    roleId: "2",
    roleCode: "PILOTO",
    roleName: "Piloto",
    phone: null,
    dpi: "1234567890123",
    hireDate: "2024-03-05",
    address: null,
    licenseNumber: null,
    educationHistory: null,
    languages: null,
    ...overrides,
  };
}

interface Responses {
  empleados?: Empleado[] | Error;
  roles?: PersonalRole[] | Error;
}

function setupApi({ empleados = [empleado()], roles = ROLES }: Responses = {}) {
  mockGet.mockImplementation(async (path: string) => {
    const result = path.startsWith("/personal/roles") ? roles : empleados;
    if (result instanceof Error) throw result;
    return result as never;
  });
}

function empleadosCalls(): string[] {
  return mockGet.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/personal/empleados"));
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PersonalPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PersonalPage", () => {
  it("shows a loading state and then the rows", async () => {
    setupApi();
    renderPage();
    expect(screen.getByText("Cargando...")).toBeInTheDocument();
    expect(await screen.findByText("Ana López")).toBeInTheDocument();
    expect(screen.queryByText("Cargando...")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Personal (1)" })).toBeInTheDocument();
  });

  it("shows an error banner and retries", async () => {
    setupApi({ empleados: new Error("boom") });
    renderPage();
    const alert = await screen.findByRole("alert");
    expect(alert).toBeInTheDocument();

    setupApi();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Ana López")).toBeInTheDocument();
  });

  it("shows the empty state when there are no employees", async () => {
    setupApi({ empleados: [] });
    renderPage();
    expect(await screen.findByText("Aún no hay empleados registrados")).toBeInTheDocument();
  });

  it("shows the filtered empty state when filters are active", async () => {
    setupApi({ empleados: [] });
    renderPage();
    await screen.findByText("Aún no hay empleados registrados");
    fireEvent.change(screen.getByLabelText("Filtrar por estado"), { target: { value: "INACTIVO" } });
    expect(
      await screen.findByText("No se encontraron empleados con los filtros aplicados"),
    ).toBeInTheDocument();
  });

  it("debounces the search before it reaches the API", async () => {
    setupApi();
    vi.useFakeTimers();
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(empleadosCalls()).toEqual(["/personal/empleados"]);

    const input = screen.getByLabelText("Buscar empleados");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ana" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(empleadosCalls()).toEqual(["/personal/empleados"]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(empleadosCalls()).toEqual(["/personal/empleados", "/personal/empleados?search=ana"]);
  });

  it("passes status and role filters immediately", async () => {
    setupApi();
    renderPage();
    await screen.findByText("Ana López");
    await screen.findByRole("option", { name: "Piloto" });

    fireEvent.change(screen.getByLabelText("Filtrar por estado"), { target: { value: "ACTIVO" } });
    await waitFor(() => expect(empleadosCalls()).toContain("/personal/empleados?status=ACTIVO"));

    fireEvent.change(screen.getByLabelText("Filtrar por rol"), { target: { value: "2" } });
    await waitFor(() =>
      expect(empleadosCalls()).toContain("/personal/empleados?status=ACTIVO&roleId=2"),
    );
  });

  it("keeps working when roles fail to load", async () => {
    setupApi({ roles: new Error("roles down") });
    renderPage();
    expect(await screen.findByText("Ana López")).toBeInTheDocument();
    expect(await screen.findByText(/No se pudieron cargar los roles/)).toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar por rol")).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
