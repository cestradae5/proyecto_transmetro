import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LineaMunicipalidadesDialog } from "../../features/infrastructure/components/lineas/linea-municipalidades-dialog";
import {
  EstadoMunicipalidad,
  type Linea,
  type Municipalidad,
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
const mockDelete = vi.mocked(apiClient.delete);

const LINEA: Linea = {
  idLinea: "7",
  numeroLinea: "L7",
  nombreLinea: "Periférico",
  colorHex: "#00ff00",
  tipoRecorrido: "LINEAL" as Linea["tipoRecorrido"],
  idParqueo: null,
  estadoLinea: "ACTIVA" as Linea["estadoLinea"],
};

const MUNICIPALIDADES: Municipalidad[] = [
  { idMunicipalidad: "1", nombreMunicipalidad: "Mixco", departamento: "Guatemala", estadoMunicipalidad: EstadoMunicipalidad.ACTIVA },
  { idMunicipalidad: "2", nombreMunicipalidad: "Villa Nueva", departamento: "Guatemala", estadoMunicipalidad: EstadoMunicipalidad.ACTIVA },
  { idMunicipalidad: "3", nombreMunicipalidad: "Antigua", departamento: "Sacatepéquez", estadoMunicipalidad: EstadoMunicipalidad.INACTIVA },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDialog(onClose = vi.fn()) {
  const utils = render(
    <LineaMunicipalidadesDialog linea={LINEA} municipalidades={MUNICIPALIDADES} onClose={onClose} />
  );
  return { ...utils, onClose };
}

describe("LineaMunicipalidadesDialog", () => {
  it("lists the linked municipalidades", async () => {
    mockGet.mockResolvedValue([{ idLinea: "7", idMunicipalidad: "1", nombreMunicipalidad: "Mixco" }]);
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Municipalidades de la línea" })).toHaveTextContent("Línea L7 - Periférico");
    expect(await screen.findByText("Mixco")).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/infrastructure/lineas/7/municipalidades");
  });

  it("shows an empty state when nothing is linked", async () => {
    mockGet.mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText("La línea no tiene municipalidades asignadas.")).toBeInTheDocument();
  });

  it("offers only active municipalidades that are not linked yet", async () => {
    mockGet.mockResolvedValue([{ idLinea: "7", idMunicipalidad: "1", nombreMunicipalidad: "Mixco" }]);
    renderDialog();
    await screen.findByText("Mixco");

    const select = screen.getByLabelText("Municipalidad") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "2"]);
  });

  it("adds the selected municipalidad", async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue({ idLinea: "7", idMunicipalidad: "2" });
    renderDialog();
    await screen.findByText("La línea no tiene municipalidades asignadas.");

    const addButton = screen.getByRole("button", { name: "Agregar municipalidad" });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Municipalidad"), { target: { value: "2" } });
    fireEvent.click(addButton);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/infrastructure/lineas/7/municipalidades", { idMunicipalidad: "2" })
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  it("shows the Spanish message on a duplicate link", async () => {
    mockGet.mockResolvedValue([]);
    mockPost.mockRejectedValue(new ApiError(409, "raw", { error: "LINEA_MUNICIPALIDAD_DUPLICATE" }));
    renderDialog();
    await screen.findByText("La línea no tiene municipalidades asignadas.");

    fireEvent.change(screen.getByLabelText("Municipalidad"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar municipalidad" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La municipalidad ya está asignada a la línea");
  });

  it("removes a link after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockGet.mockResolvedValue([{ idLinea: "7", idMunicipalidad: "1", nombreMunicipalidad: "Mixco" }]);
    mockDelete.mockResolvedValue(undefined);
    renderDialog();

    const item = (await screen.findByText("Mixco")).closest("li") as HTMLElement;
    fireEvent.click(within(item).getByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/infrastructure/lineas/7/municipalidades/1"));
  });

  it("keeps the link when the confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockGet.mockResolvedValue([{ idLinea: "7", idMunicipalidad: "1", nombreMunicipalidad: "Mixco" }]);
    renderDialog();

    const item = (await screen.findByText("Mixco")).closest("li") as HTMLElement;
    fireEvent.click(within(item).getByRole("button", { name: "Quitar" }));

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("shows the load error with a retry button", async () => {
    mockGet.mockRejectedValueOnce(new ApiError(500, "Server Error")).mockResolvedValue([]);
    renderDialog();

    expect(await screen.findByText("Error de conexión. Por favor, intente de nuevo.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("La línea no tiene municipalidades asignadas.")).toBeInTheDocument();
  });

  it("closes with Cerrar", async () => {
    mockGet.mockResolvedValue([]);
    const { onClose } = renderDialog();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});
