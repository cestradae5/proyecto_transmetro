import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Empleado } from "../../features/personal/types/personal.types";

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
vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});

import { apiClient, ApiError } from "../../lib/api-client";
import { useAuth } from "../../features/authentication/auth-context";
import { PersonalPage } from "../../features/personal";
import { EMPLEADOS_PERFILES_ADMINISTRAR } from "../../features/personal/permissions";

const mockGet = vi.mocked(apiClient.get);
const mockPatch = vi.mocked(apiClient.patch);
const mockDelete = vi.mocked(apiClient.delete);
const mockedUseAuth = useAuth as unknown as Mock;

const ANA: Empleado = {
  id: "5",
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
const LUIS: Empleado = { ...ANA, id: "6", name: "Luis Gómez", email: "luis@transmetro.test", status: "INACTIVO" };

function authAs(permissions: string[]) {
  mockedUseAuth.mockReturnValue({
    user: {
      email: "op@transmetro.gt",
      employeeId: "1",
      roles: ["OPERADOR_CENTRAL"],
      permissions,
      scope: { role: "OPERADOR_CENTRAL", modules: ["personnel"] },
    },
  });
}

/** Serves roles and a mutable employee list so refetches reflect mutations. */
function setupGet(list: { current: Empleado[] }) {
  mockGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/personal/roles")) return [] as never;
    return list.current as never;
  });
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

describe("PersonalPage delete and status", () => {
  it("shows no mutation controls without EMPLEADOS_PERFILES_ADMINISTRAR", async () => {
    authAs(["OTRO_PERMISO"]);
    setupGet({ current: [ANA, LUIS] });
    renderPage();
    await screen.findByText("Ana López");
    expect(screen.queryByRole("button", { name: /^Eliminar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Activar|Desactivar)/ })).not.toBeInTheDocument();
  });

  it("deletes after confirmation, refreshes the list and closes the dialog", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    const list = { current: [ANA, LUIS] };
    setupGet(list);
    mockDelete.mockImplementation(async () => {
      list.current = [LUIS];
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Ana López" }));
    const dialog = screen.getByRole("alertdialog", { name: "Eliminar empleado" });
    expect(dialog).toHaveTextContent("Ana López");
    expect(mockDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/personal/empleados/5"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Ana López")).not.toBeInTheDocument());
    expect(screen.getByText("Luis Gómez")).toBeInTheDocument();
  });

  it("shows the 409 message and keeps the dialog open", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet({ current: [ANA] });
    mockDelete.mockRejectedValue(
      new ApiError(409, "Conflict", { message: "El empleado tiene historial; desactívalo en su lugar" }),
    );
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Ana López" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    const dialog = await screen.findByRole("alertdialog");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("desactívalo en su lugar");
    expect(dialog).toContainElement(alert);
  });

  it("deactivates instead after a failed delete and closes the dialog", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet({ current: [ANA] });
    mockDelete.mockRejectedValue(new ApiError(409, "Conflict", { message: "Tiene historial" }));
    mockPatch.mockResolvedValue({ ...ANA, status: "INACTIVO" } as never);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar Ana López" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Desactivar en su lugar" }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/personal/empleados/5", { status: "INACTIVO" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("toggles to the opposite status with PATCH", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet({ current: [ANA, LUIS] });
    mockPatch.mockResolvedValue(ANA as never);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Desactivar Ana López" }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/personal/empleados/5", { status: "INACTIVO" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Activar Luis Gómez" }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/personal/empleados/6", { status: "ACTIVO" }),
    );
  });

  it("shows a dismissible banner when the toggle fails", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet({ current: [ANA] });
    mockPatch.mockRejectedValue(new ApiError(404, "Not Found", { message: "El empleado ya no existe" }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Desactivar Ana López" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("El empleado no existe o fue eliminado.");
    expect(screen.getByRole("button", { name: "Desactivar Ana López" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
