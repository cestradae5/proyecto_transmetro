import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ProfilePage } from "../../features/dashboard/profile-page";
import { useAuth } from "../../features/authentication/auth-context";
import { apiClient } from "../../lib/api-client";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});

vi.mock("../../lib/api-client", () => ({
  apiClient: { get: vi.fn() },
}));

const mockedUseAuth = useAuth as unknown as Mock;
const mockedGet = apiClient.get as unknown as Mock;

const baseProfile = {
  employeeId: "5",
  name: "Ana Perez",
  email: "ana@transmetro.gt",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/landing" element={<div>Landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProfilePage", () => {
  it("goes back to the landing page with the back button", async () => {
    mockedGet.mockResolvedValue({
      ...baseProfile,
      role: { code: "OPERADOR_CENTRAL", name: "Operador central" },
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(screen.getByText("Landing")).toBeInTheDocument();
  });

  beforeEach(() => {
    mockedGet.mockReset();
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      loading: false,
      user: {
        email: "ana@transmetro.gt",
        employeeId: "5",
        roles: [],
        permissions: [],
        scope: { role: "X", modules: [] },
      },
      token: "t",
      login: vi.fn(),
      logout: vi.fn(),
    });
  });

  it("shows name, email, role and station for a station operator", async () => {
    mockedGet.mockResolvedValue({
      ...baseProfile,
      role: { code: "OPERADOR_ESTACION", name: "Operador de estación" },
      station: { idEstacion: "10", nombreEstacion: "Estación Central" },
    });

    renderPage();

    expect(await screen.findByText("Ana Perez")).toBeInTheDocument();
    expect(screen.getByText("ana@transmetro.gt")).toBeInTheDocument();
    expect(screen.getByText("Operador de estación")).toBeInTheDocument();
    expect(screen.getByText("Estación")).toBeInTheDocument();
    expect(screen.getByText("Estación Central")).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith("/profile");
  });

  it("shows the line for a pilot and no station card", async () => {
    mockedGet.mockResolvedValue({
      ...baseProfile,
      role: { code: "PILOTO", name: "Piloto" },
      line: { idLinea: "3", numeroLinea: "L1", nombreLinea: "Norte", colorHex: "#FF0000" },
    });

    renderPage();

    expect(await screen.findByText("L1 - Norte")).toBeInTheDocument();
    expect(screen.getByText("Línea")).toBeInTheDocument();
    expect(screen.queryByText("Estación")).not.toBeInTheDocument();
  });

  it("shows the license number for a pilot, and no employee ID card", async () => {
    mockedGet.mockResolvedValue({
      ...baseProfile,
      role: { code: "PILOTO", name: "Piloto" },
      licenseNumber: "LIC-123",
      line: { idLinea: "3", numeroLinea: "L1", nombreLinea: "Norte", colorHex: "#FF0000" },
    });

    renderPage();

    expect(await screen.findByText("LIC-123")).toBeInTheDocument();
    expect(screen.getByText("Número de licencia")).toBeInTheDocument();
    expect(screen.queryByText("ID de Empleado")).not.toBeInTheDocument();
  });

  it("shows 'Sin registrar' when a pilot has no license", async () => {
    mockedGet.mockResolvedValue({
      ...baseProfile,
      role: { code: "PILOTO", name: "Piloto" },
      licenseNumber: null,
    });

    renderPage();

    expect(await screen.findByText("Sin registrar")).toBeInTheDocument();
  });

  it("shows no license card for non-pilots", async () => {
    mockedGet.mockResolvedValue({
      ...baseProfile,
      role: { code: "OPERADOR_ESTACION", name: "Operador de estación" },
    });

    renderPage();

    await screen.findByText("Operador de estación");
    expect(screen.queryByText("Número de licencia")).not.toBeInTheDocument();
  });

  it("shows 'Sin asignar' when an operator has no station", async () => {
    mockedGet.mockResolvedValue({
      ...baseProfile,
      role: { code: "OPERADOR_ESTACION", name: "Operador de estación" },
    });

    renderPage();

    expect(await screen.findByText("Sin asignar")).toBeInTheDocument();
  });

  it("shows 'Sin asignar' when a pilot has no line", async () => {
    mockedGet.mockResolvedValue({ ...baseProfile, role: { code: "PILOTO", name: "Piloto" } });

    renderPage();

    expect(await screen.findByText("Sin asignar")).toBeInTheDocument();
  });

  it("shows no assignment card for other roles", async () => {
    mockedGet.mockResolvedValue({
      ...baseProfile,
      role: { code: "OPERADOR_CENTRAL", name: "Operador central" },
    });

    renderPage();

    expect(await screen.findByText("Operador central")).toBeInTheDocument();
    expect(screen.queryByText("Estación")).not.toBeInTheDocument();
    expect(screen.queryByText("Línea")).not.toBeInTheDocument();
  });

  it("shows an alert when the profile request fails", async () => {
    mockedGet.mockRejectedValue(new Error("boom"));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el perfil");
  });

  it("shows the loading state while the request is pending", () => {
    mockedGet.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("Cargando...")).toBeInTheDocument();
  });
});
