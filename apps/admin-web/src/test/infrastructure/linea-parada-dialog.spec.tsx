import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LineaParadaDialog } from "../../features/infrastructure/components/lineas/linea-parada-dialog";
import type { Linea, Parada } from "../../features/infrastructure/types/infrastructure.types";

vi.mock("../../lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
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

import { apiClient, ApiError } from "../../lib/api-client";

const mockGet = vi.mocked(apiClient.get);

const LINEA: Linea = {
  idLinea: "1",
  numeroLinea: "L1",
  nombreLinea: "Central",
  colorHex: "#ff0000",
  tipoRecorrido: "LINEAL" as any,
  idParqueo: "1",
  estadoLinea: "ACTIVA" as any,
};

const PARADAS: Parada[] = [
  {
    idParada: 1,
    nombreParada: "Parada A",
    latitud: 14.0,
    longitud: -90.0,
    estadoParada: "ACTIVA" as any,
    fecha_creacion: "2026-01-01T00:00:00.000Z",
    fecha_actualizacion: "2026-01-01T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(onClose = vi.fn()) {
  const utils = render(<LineaParadaDialog linea={LINEA} paradas={PARADAS} onClose={onClose} />);
  return { ...utils, onClose };
}

describe("LineaParadaDialog", () => {
  it("shows the título including the línea nombre", async () => {
    mockGet.mockResolvedValue([]);
    renderDialog();
    expect(screen.getByText("Gestionar paradas: Central")).toBeTruthy();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
  });

  it("closes when the X button is clicked", async () => {
    mockGet.mockResolvedValue([]);
    const { onClose } = renderDialog();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("Cerrar"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the Cerrar button is clicked", async () => {
    mockGet.mockResolvedValue([]);
    const { onClose } = renderDialog();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Cerrar"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    mockGet.mockResolvedValue([]);
    const { onClose, container } = renderDialog();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when Escape is pressed", async () => {
    mockGet.mockResolvedValue([]);
    const { onClose } = renderDialog();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the mapped Spanish message when the fetch fails", async () => {
    mockGet.mockRejectedValue(new ApiError(500, "Server Error"));
    renderDialog();
    expect(
      await screen.findByText("Error de conexión. Por favor, intente de nuevo.")
    ).toBeTruthy();
  });
});
