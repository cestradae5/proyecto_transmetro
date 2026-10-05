import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
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
const mockPost = vi.mocked(apiClient.post);
const mockPatch = vi.mocked(apiClient.patch);
const mockedUseAuth = useAuth as unknown as Mock;

const ROLES: PersonalRole[] = [
  { id: "1", code: "OPERADOR_CENTRAL", name: "Operador Central" },
  { id: "2", code: "PILOTO", name: "Piloto" },
];

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
  hireDate: "2024-03-05",
  address: null,
  licenseNumber: null,
  educationHistory: null,
  languages: null,
};

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

function setupGet(roles: PersonalRole[] | Error = ROLES) {
  mockGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/personal/roles")) {
      if (roles instanceof Error) throw roles;
      return roles as never;
    }
    return [ANA] as never;
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PersonalPage />
    </MemoryRouter>,
  );
}

const change = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PersonalPage create/edit", () => {
  it("hides the create and edit controls without EMPLEADOS_PERFILES_ADMINISTRAR", async () => {
    authAs(["OTRO_PERMISO"]);
    setupGet();
    renderPage();
    await screen.findByText("Ana López");
    expect(screen.queryByRole("button", { name: "Nuevo empleado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Acciones")).not.toBeInTheDocument();
  });

  it("shows the create and edit controls with the permission", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet();
    renderPage();
    await screen.findByText("Ana López");
    expect(screen.getByRole("button", { name: "Nuevo empleado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar Ana López" })).toBeInTheDocument();
  });

  it("creates an employee, posts to the API and closes the dialog", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet();
    mockPost.mockResolvedValue({ ...ANA, id: "6" } as never);
    renderPage();
    await screen.findByText("Ana López");
    await screen.findByRole("option", { name: "Piloto", selected: false });

    fireEvent.click(screen.getByRole("button", { name: "Nuevo empleado" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo empleado" });
    expect(dialog).toBeInTheDocument();

    change(/Nombre/, "Carlos Ruiz");
    change(/Correo/, "carlos@transmetro.test");
    fireEvent.change(screen.getByLabelText(/Rol \*/), { target: { value: "1" } });
    change(/DPI/, "2456789012301");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/personal/empleados", {
        name: "Carlos Ruiz",
        email: "carlos@transmetro.test",
        roleId: "1",
        dpi: "2456789012301",
        status: "ACTIVO",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("edits an employee with PATCH and closes the dialog", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet();
    mockPatch.mockResolvedValue(ANA as never);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Editar Ana López" }));

    expect(screen.getByRole("dialog", { name: "Editar empleado" })).toBeInTheDocument();
    change(/Nombre/, "Ana María López");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(
        "/personal/empleados/5",
        expect.objectContaining({ name: "Ana María López", dpi: "1234567890123" }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the 409 message and keeps the dialog open", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet();
    mockPost.mockRejectedValue(new ApiError(409, "Conflict", { message: "Ya existe un empleado con ese correo" }));
    renderPage();
    await screen.findByText("Ana López");
    await screen.findByRole("option", { name: "Piloto", selected: false });

    fireEvent.click(screen.getByRole("button", { name: "Nuevo empleado" }));
    change(/Nombre/, "Carlos Ruiz");
    change(/Correo/, "ana@transmetro.test");
    fireEvent.change(screen.getByLabelText(/Rol \*/), { target: { value: "1" } });
    change(/DPI/, "2456789012301");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const dialog = await screen.findByRole("dialog", { name: "Nuevo empleado" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ya existe un empleado con ese correo");
    expect(dialog).toContainElement(alert);
  });

  it("blocks create and edit with a clear message when roles failed to load", async () => {
    authAs([EMPLEADOS_PERFILES_ADMINISTRAR]);
    setupGet(new Error("roles down"));
    renderPage();
    await screen.findByText("Ana López");
    await screen.findByText(/No se pudieron cargar los roles/);

    fireEvent.click(screen.getByRole("button", { name: "Nuevo empleado" }));
    const dialog = screen.getByRole("dialog", { name: "Nuevo empleado" });
    expect(dialog).toHaveTextContent("No es posible crear empleados");
    expect(screen.queryByLabelText(/Nombre/)).not.toBeInTheDocument();
  });
});
