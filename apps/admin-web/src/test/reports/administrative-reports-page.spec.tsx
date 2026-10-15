import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { useAuth, type User } from "../../features/authentication/auth-context";

vi.mock("../../features/authentication/auth-context", async () => {
  const actual = await vi.importActual<typeof import("../../features/authentication/auth-context")>(
    "../../features/authentication/auth-context",
  );
  return { ...actual, useAuth: vi.fn() };
});

vi.mock("../../lib/api-client", () => ({
  apiClient: { get: vi.fn(), download: vi.fn() },
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
import { AdministrativeReportsPage } from "../../features/reports";

const mockedUseAuth = useAuth as unknown as Mock;

function signIn(permissions: string[], modules: string[] = ["reports"]) {
  const user: User = {
    email: "user@transmetro.gt",
    employeeId: "emp-1",
    roles: ["OPERADOR_CENTRAL"],
    permissions,
    scope: { role: "OPERADOR_CENTRAL", modules },
  };
  mockedUseAuth.mockReturnValue({
    user,
    token: "fake-jwt",
    isAuthenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const mockDownload = vi.mocked(apiClient.download);
const ALL = ["AUDITORIA_BITACORA_CONSULTAR", "REPORTES_ADMINISTRATIVOS_CONSULTAR"];
let createObjectURL: Mock;
let revokeObjectURL: Mock;
let clickSpy: ReturnType<typeof vi.spyOn>;
let savedNames: string[];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/reports/administrative"]}>
      <Routes>
        <Route path="/reports/administrative" element={<AdministrativeReportsPage />} />
        <Route path="/reports" element={<div>Hub destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const downloadButton = (title: string) =>
  screen.getByRole("button", { name: `Descargar PDF: ${title}` });

/** Date inputs of one ranged report card; each card keeps its own range. */
const rangeOf = (title: string) => {
  const card = within(screen.getByRole("region", { name: title }));
  return { from: card.getByLabelText("Desde"), to: card.getByLabelText("Hasta") };
};

beforeEach(() => {
  vi.clearAllMocks();
  savedNames = [];
  createObjectURL = vi.fn(() => "blob:report");
  revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    savedNames.push(this.download);
  });
  mockDownload.mockResolvedValue({ blob: new Blob(["%PDF"]), fileName: "reporte-flota-2026-01-15.pdf" });
});

afterEach(() => clickSpy.mockRestore());

describe("AdministrativeReportsPage", () => {
  it("lists the five reports for a user with both permissions", () => {
    signIn(ALL);
    renderPage();
    for (const title of ["Flota", "Personal", "Infraestructura", "Alertas operativas", "Resumen de bitácora"]) {
      expect(downloadButton(title)).toBeInTheDocument();
    }
  });

  it("shows only the audit summary to a user with only AUDITORIA_BITACORA_CONSULTAR", () => {
    signIn(["AUDITORIA_BITACORA_CONSULTAR"]);
    renderPage();
    expect(downloadButton("Resumen de bitácora")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar PDF: Flota" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descargar PDF: Alertas operativas" })).not.toBeInTheDocument();
  });

  it("hides the audit summary from a user without AUDITORIA_BITACORA_CONSULTAR", () => {
    signIn(["REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    renderPage();
    expect(screen.queryByRole("button", { name: "Descargar PDF: Resumen de bitácora" })).not.toBeInTheDocument();
  });

  it.each([
    ["Flota", "/reports/fleet"],
    ["Personal", "/reports/personnel"],
    ["Infraestructura", "/reports/infrastructure"],
  ])("downloads %s as a PDF file", async (title, path) => {
    signIn(ALL);
    renderPage();
    fireEvent.click(downloadButton(title));

    await waitFor(() => expect(savedNames).toEqual(["reporte-flota-2026-01-15.pdf"]));
    expect(mockDownload).toHaveBeenCalledWith(path, expect.stringMatching(/\.pdf$/));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("requires both dates for the audit summary and sends them", async () => {
    signIn(ALL);
    renderPage();
    expect(downloadButton("Resumen de bitácora")).toBeDisabled();

    fireEvent.change(rangeOf("Resumen de bitácora").from, { target: { value: "2026-01-01" } });
    expect(downloadButton("Resumen de bitácora")).toBeDisabled();
    fireEvent.change(rangeOf("Resumen de bitácora").to, { target: { value: "2026-01-31" } });
    fireEvent.click(downloadButton("Resumen de bitácora"));

    await waitFor(() =>
      expect(mockDownload).toHaveBeenCalledWith(
        "/reports/audit-log?from=2026-01-01&to=2026-01-31",
        expect.stringMatching(/\.pdf$/),
      ),
    );
  });

  it("blocks a range whose start is after its end", () => {
    signIn(ALL);
    renderPage();
    fireEvent.change(rangeOf("Resumen de bitácora").from, { target: { value: "2026-02-01" } });
    fireEvent.change(rangeOf("Resumen de bitácora").to, { target: { value: "2026-01-31" } });

    expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeInTheDocument();
    expect(downloadButton("Resumen de bitácora")).toBeDisabled();
  });

  it("requires both dates for the alerts report and sends them (alerts S7)", async () => {
    signIn(["REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    renderPage();
    expect(downloadButton("Alertas operativas")).toBeDisabled();

    fireEvent.change(rangeOf("Alertas operativas").from, { target: { value: "2026-03-01" } });
    expect(downloadButton("Alertas operativas")).toBeDisabled();
    fireEvent.change(rangeOf("Alertas operativas").to, { target: { value: "2026-03-31" } });
    fireEvent.click(downloadButton("Alertas operativas"));

    await waitFor(() =>
      expect(mockDownload).toHaveBeenCalledWith(
        "/reports/alerts?from=2026-03-01&to=2026-03-31",
        "reporte-alertas-2026-03-01_2026-03-31.pdf",
      ),
    );
  });

  it("keeps the alerts range independent of the audit summary range", () => {
    signIn(ALL);
    renderPage();
    fireEvent.change(rangeOf("Resumen de bitácora").from, { target: { value: "2026-01-01" } });
    fireEvent.change(rangeOf("Resumen de bitácora").to, { target: { value: "2026-01-31" } });

    expect(downloadButton("Resumen de bitácora")).toBeEnabled();
    expect(downloadButton("Alertas operativas")).toBeDisabled();
    expect(rangeOf("Alertas operativas").from).toHaveValue("");
  });

  it("blocks an inverted alerts range", () => {
    signIn(["REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    renderPage();
    fireEvent.change(rangeOf("Alertas operativas").from, { target: { value: "2026-04-01" } });
    fireEvent.change(rangeOf("Alertas operativas").to, { target: { value: "2026-03-31" } });

    expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeInTheDocument();
    expect(downloadButton("Alertas operativas")).toBeDisabled();
  });

  it("disables the button and shows progress while downloading", async () => {
    signIn(ALL);
    let resolve!: (value: { blob: Blob; fileName: string }) => void;
    mockDownload.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPage();
    fireEvent.click(downloadButton("Flota"));

    expect(await screen.findByRole("button", { name: "Descargar PDF: Flota" })).toBeDisabled();
    expect(screen.getByText("Generando…")).toBeInTheDocument();
    resolve({ blob: new Blob(["%PDF"]), fileName: "x.pdf" });
    await waitFor(() => expect(downloadButton("Flota")).toBeEnabled());
  });

  it.each([
    [new ApiError(403, "Forbidden"), "No tiene permiso para generar este reporte."],
    [new ApiError(401, "Unauthorized"), "Su sesión expiró. Inicie sesión de nuevo."],
    [new ApiError(500, "boom"), "No se pudo generar el reporte. Intente de nuevo."],
    [new TypeError("Failed to fetch"), "No se pudo conectar con el servidor. Intente de nuevo."],
  ])("shows an error when the download fails (%s)", async (error, message) => {
    signIn(ALL);
    mockDownload.mockRejectedValue(error);
    renderPage();
    fireEvent.click(downloadButton("Personal"));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(savedNames).toEqual([]);
  });

  it("goes back to the reports hub", async () => {
    signIn(ALL);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByText("Hub destination")).toBeInTheDocument();
  });
});
