import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AccesosDialog } from "../../features/infrastructure/components/paradas/accesos-dialog";
import {
  EstadoAcceso,
  TipoAcceso,
  type Acceso,
  type Parada,
} from "../../features/infrastructure/types/infrastructure.types";

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
const mockPost = vi.mocked(apiClient.post);
const mockPatch = vi.mocked(apiClient.patch);
const mockDelete = vi.mocked(apiClient.delete);

const PARADA: Parada = {
  idParada: 5,
  nombreParada: "Parada Central",
  latitud: 14.6349,
  longitud: -90.5069,
  estadoParada: "ACTIVA" as Parada["estadoParada"],
  esEstacion: false,
  idEstacion: null,
};

const HABILITADO: Acceso = {
  idAcceso: "3",
  idParada: "5",
  nombreAcceso: "Acceso norte",
  latitud: "14.60000000" as unknown as number,
  longitud: "-90.50000000" as unknown as number,
  tipoAcceso: TipoAcceso.RAMPA,
  estadoAcceso: EstadoAcceso.HABILITADO,
};

const DESHABILITADO: Acceso = {
  ...HABILITADO,
  idAcceso: "4",
  nombreAcceso: "Acceso sur",
  estadoAcceso: EstadoAcceso.DESHABILITADO,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDialog(onClose = vi.fn()) {
  const utils = render(<AccesosDialog parada={PARADA} onClose={onClose} />);
  return { ...utils, onClose };
}

function rowOf(nombre: string) {
  return screen.getByText(nombre).closest("tr") as HTMLElement;
}

describe("AccesosDialog", () => {
  it("lists accesos with tipo, estado and coordinates", async () => {
    mockGet.mockResolvedValue([HABILITADO, DESHABILITADO]);
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Accesos de la parada" })).toHaveTextContent("Parada Parada Central");
    const row = (await screen.findByText("Acceso norte")).closest("tr") as HTMLElement;
    expect(within(row).getByText("RAMPA")).toBeInTheDocument();
    expect(within(row).getByText("HABILITADO")).toBeInTheDocument();
    expect(within(row).getByText("14.600000, -90.500000")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/infrastructure/paradas/5/accesos");
  });

  it("shows an empty state", async () => {
    mockGet.mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText("La parada no tiene accesos registrados.")).toBeInTheDocument();
  });

  it("creates an acceso with the parada coordinates prefilled", async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue({ ...HABILITADO, idAcceso: "9" });
    renderDialog();
    await screen.findByText("La parada no tiene accesos registrados.");

    fireEvent.click(screen.getByRole("button", { name: "Nuevo acceso" }));
    expect(screen.getByLabelText(/^Latitud/)).toHaveValue(14.6349);
    expect(screen.getByLabelText(/^Longitud/)).toHaveValue(-90.5069);

    fireEvent.change(screen.getByLabelText(/^Nombre del acceso/), { target: { value: "Acceso oeste" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/infrastructure/paradas/5/accesos", {
        nombreAcceso: "Acceso oeste",
        tipoAcceso: "PEATONAL",
        estadoAcceso: "HABILITADO",
        latitud: 14.6349,
        longitud: -90.5069,
      })
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument());
  });

  it("edits an acceso through PATCH", async () => {
    mockGet.mockResolvedValue([HABILITADO]);
    mockPatch.mockResolvedValue(HABILITADO);
    renderDialog();
    await screen.findByText("Acceso norte");

    fireEvent.click(within(rowOf("Acceso norte")).getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Editar acceso")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre del acceso/)).toHaveValue("Acceso norte");

    fireEvent.change(screen.getByLabelText(/^Tipo/), { target: { value: "ESCALERA" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/infrastructure/paradas/5/accesos/3", {
        nombreAcceso: "Acceso norte",
        tipoAcceso: "ESCALERA",
        estadoAcceso: "HABILITADO",
        latitud: 14.6,
        longitud: -90.5,
      })
    );
  });

  it("keeps the form open and shows the mapped error when saving fails", async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockRejectedValue(new ApiError(404, "Not Found"));
    renderDialog();
    await screen.findByText("La parada no tiene accesos registrados.");

    fireEvent.click(screen.getByRole("button", { name: "Nuevo acceso" }));
    fireEvent.change(screen.getByLabelText(/^Nombre del acceso/), { target: { value: "Acceso oeste" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La parada o el acceso no existe o fue eliminado");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("offers Desactivar only for enabled accesos and deactivates after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet.mockResolvedValue([HABILITADO, DESHABILITADO]);
    mockDelete.mockResolvedValue(undefined);
    renderDialog();
    await screen.findByText("Acceso norte");

    expect(within(rowOf("Acceso sur")).queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();

    fireEvent.click(within(rowOf("Acceso norte")).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/infrastructure/paradas/5/accesos/3"));
  });

  it("does not deactivate when the confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockGet.mockResolvedValue([HABILITADO]);
    renderDialog();
    await screen.findByText("Acceso norte");

    fireEvent.click(within(rowOf("Acceso norte")).getByRole("button", { name: "Desactivar" }));

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("shows the load error with a retry button", async () => {
    mockGet.mockRejectedValueOnce(new ApiError(500, "Server Error")).mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText("Error de conexión. Por favor, intente de nuevo.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("La parada no tiene accesos registrados.")).toBeInTheDocument();
  });

  it("closes with Cerrar", async () => {
    mockGet.mockResolvedValue([]);
    const { onClose } = renderDialog();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
