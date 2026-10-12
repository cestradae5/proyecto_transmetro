import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InfrastructureWizard } from "../../features/infrastructure/components/wizard/infrastructure-wizard";
import type { LineaParada, Parada } from "../../features/infrastructure/types/infrastructure.types";

vi.mock("../../lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
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
const mockPut = vi.mocked(apiClient.put);
const mockDelete = vi.mocked(apiClient.delete);

const MUNICIPALIDADES = [
  { idMunicipalidad: "1", nombreMunicipalidad: "Mixco", departamento: "Guatemala", estadoMunicipalidad: "ACTIVA" },
  { idMunicipalidad: "2", nombreMunicipalidad: "Antigua", departamento: "Sacatepéquez", estadoMunicipalidad: "INACTIVA" },
];

const PARQUEOS = [
  {
    idParqueo: "9",
    nombreParqueo: "Central Norte",
    tipoParqueo: "CENTRAL",
    direccion: "Zona 18",
    latitud: 14.6,
    longitud: -90.5,
    capacidadUnidades: 20,
    estadoParqueo: "ACTIVO",
  },
];

const LINEA = {
  idLinea: "50",
  numeroLinea: "L50",
  nombreLinea: "Mixco Express",
  colorHex: "#FF0000",
  tipoRecorrido: "LINEAL",
  estadoLinea: "ACTIVA",
  idParqueo: null,
};

function parada(id: number, nombre: string, esEstacion = false): Parada {
  return {
    idParada: id,
    nombreParada: nombre,
    latitud: 14.6,
    longitud: -90.5,
    estadoParada: "ACTIVA" as Parada["estadoParada"],
    esEstacion,
    idEstacion: esEstacion ? String(id * 10) : null,
  };
}

const PARADAS = [parada(1, "Parada A"), parada(2, "Parada B", true), parada(3, "Parada C"), parada(4, "Parada D")];

function row(idLineaParada: string, orden: number, p: Parada, minutos = 5): LineaParada {
  const { esEstacion: _e, idEstacion: _i, ...bare } = p;
  return { idLineaParada, orden, minutosHastaSiguiente: minutos, idParada: String(p.idParada), idLinea: "50", parada: bare };
}

const THREE_ROWS = [row("101", 1, PARADAS[0]!), row("102", 2, PARADAS[1]!), row("103", 3, PARADAS[2]!)];

let lineaParadas: LineaParada[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  lineaParadas = [];
  mockGet.mockImplementation(async (path: string) => {
    if (path === "/infrastructure/municipalidades") return MUNICIPALIDADES;
    if (path === "/infrastructure/parqueos") return PARQUEOS;
    if (path === "/infrastructure/paradas") return PARADAS;
    if (path === "/infrastructure/lineas/50/paradas") return lineaParadas;
    return [];
  });
  mockPost.mockImplementation(async (path: string, data: any) => {
    if (path === "/infrastructure/municipalidades") return { idMunicipalidad: "7", estadoMunicipalidad: "ACTIVA", ...data };
    if (path === "/infrastructure/lineas") return { ...LINEA, ...data, idLinea: "50" };
    if (path === "/infrastructure/lineas/50/municipalidades") return { idLinea: "50", ...data };
    if (path === "/infrastructure/parqueos") return { idParqueo: "11", ...data };
    if (path === "/infrastructure/paradas") return { idParada: "77", esEstacion: false, idEstacion: null, ...data };
    if (path === "/infrastructure/estaciones") return { idEstacion: "88", ...data };
    if (path === "/infrastructure/lineas/50/paradas") return { idLineaParada: "200", idLinea: "50", ...data };
    throw new Error(`Unexpected POST ${path}`);
  });
  mockPatch.mockImplementation(async (path: string, data: any) => {
    if (path === "/infrastructure/lineas/50") return { ...LINEA, ...data };
    return data;
  });
  mockPut.mockImplementation(async (_path: string, data: any) =>
    data.idsLineaParada.map((id: string, index: number) => ({
      ...lineaParadas.find((r) => r.idLineaParada === id)!,
      orden: index + 1,
    }))
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderWizard() {
  const onClose = vi.fn<(saved: boolean) => void>();
  render(<InfrastructureWizard onClose={onClose} />);
  return { onClose };
}

const stepButton = (n: number, title: string) => screen.getByRole("button", { name: `Paso ${n}: ${title}` });

async function chooseExistingMunicipalidad() {
  const select = await screen.findByLabelText("Municipalidad *");
  await screen.findByRole("option", { name: "Mixco (Guatemala)" });
  fireEvent.change(select, { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByRole("button", { name: "Crear línea" });
}

function fillLinea() {
  fireEvent.change(screen.getByLabelText("Número de línea *"), { target: { value: "L50" } });
  fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Mixco Express" } });
}

async function goToStep3(rows: LineaParada[] = []) {
  lineaParadas = rows;
  const utils = renderWizard();
  await chooseExistingMunicipalidad();
  fillLinea();
  fireEvent.click(screen.getByRole("button", { name: "Crear línea" }));
  await screen.findByRole("region", { name: "Parqueo (opcional)" });
  if (rows.length > 0) await screen.findByText("Parada A");
  return utils;
}

describe("InfrastructureWizard stepper", () => {
  it("starts on step 1 with steps 2 and 3 locked and explains what unlocks them", async () => {
    renderWizard();
    await screen.findByLabelText("Municipalidad *");

    expect(screen.getByRole("dialog", { name: "Nueva infraestructura" })).toBeInTheDocument();
    expect(stepButton(1, "Municipalidad")).toBeEnabled();
    expect(stepButton(1, "Municipalidad")).toHaveAttribute("aria-current", "step");
    expect(stepButton(2, "Línea")).toBeDisabled();
    expect(stepButton(2, "Línea")).toHaveAccessibleDescription("Primero elija o cree la municipalidad");
    expect(stepButton(3, "Paradas y parqueo")).toBeDisabled();
    expect(stepButton(3, "Paradas y parqueo")).toHaveAccessibleDescription("Primero cree la línea");
  });

  it("unlocks step 2 after step 1 and shows the municipalidad summary; step 3 stays locked", async () => {
    renderWizard();
    await chooseExistingMunicipalidad();

    expect(stepButton(1, "Municipalidad")).toHaveAccessibleDescription("Mixco (Guatemala)");
    expect(stepButton(2, "Línea")).toBeEnabled();
    expect(stepButton(3, "Paradas y parqueo")).toBeDisabled();
  });

  it("unlocks step 3 after the línea is created and linked, with the línea summary", async () => {
    await goToStep3();

    expect(stepButton(2, "Línea")).toHaveAccessibleDescription("L50 - Mixco Express");
    expect(stepButton(3, "Paradas y parqueo")).toBeEnabled();
    expect(stepButton(3, "Paradas y parqueo")).toHaveAttribute("aria-current", "step");
  });
});

describe("Step 1: Municipalidad", () => {
  it("offers only ACTIVA municipalidades and requires a selection", async () => {
    renderWizard();
    await screen.findByRole("option", { name: "Mixco (Guatemala)" });

    expect(screen.queryByRole("option", { name: /Antigua/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Seleccione una municipalidad", { selector: "p" })).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
    expect(stepButton(2, "Línea")).toBeDisabled();
  });

  it("creates a new municipalidad and continues with it", async () => {
    renderWizard();
    fireEvent.click(await screen.findByLabelText("Crear nueva"));
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: " Villa Nueva " } });
    fireEvent.change(screen.getByLabelText("Departamento *"), { target: { value: "Guatemala" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await screen.findByRole("button", { name: "Crear línea" });
    expect(mockPost).toHaveBeenCalledWith("/infrastructure/municipalidades", {
      nombreMunicipalidad: "Villa Nueva",
      departamento: "Guatemala",
    });
    expect(stepButton(1, "Municipalidad")).toHaveAccessibleDescription("Villa Nueva (Guatemala)");
  });

  it("validates the new municipalidad fields", async () => {
    renderWizard();
    fireEvent.click(await screen.findByLabelText("Crear nueva"));
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "x".repeat(121) } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("El nombre no puede exceder 120 caracteres")).toBeInTheDocument();
    expect(screen.getByText("El departamento es requerido")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("shows the duplicate-name message on 409 and stays on step 1", async () => {
    mockPost.mockRejectedValueOnce(new ApiError(409, "dup", { error: "MUNICIPALIDAD_NOMBRE_DUPLICATE" }));
    renderWizard();
    fireEvent.click(await screen.findByLabelText("Crear nueva"));
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Mixco" } });
    fireEvent.change(screen.getByLabelText("Departamento *"), { target: { value: "Guatemala" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe una municipalidad con ese nombre");
    expect(stepButton(2, "Línea")).toBeDisabled();
  });

  it("becomes read-only once the línea exists", async () => {
    await goToStep3();
    fireEvent.click(stepButton(1, "Municipalidad"));

    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument();
    expect(screen.getByText(/no se puede cambiar/)).toBeInTheDocument();
  });
});

describe("Step 2: Línea", () => {
  it("creates the línea without parqueo and links it to the step-1 municipalidad", async () => {
    await goToStep3();

    expect(mockPost).toHaveBeenCalledWith("/infrastructure/lineas", {
      numeroLinea: "L50",
      nombreLinea: "Mixco Express",
      colorHex: "#FF0000",
      tipoRecorrido: "LINEAL",
      estadoLinea: "ACTIVA",
      idParqueo: null,
    });
    expect(mockPost).toHaveBeenCalledWith("/infrastructure/lineas/50/municipalidades", { idMunicipalidad: "1" });
  });

  it("validates required fields and the hex color", async () => {
    renderWizard();
    await chooseExistingMunicipalidad();
    fireEvent.change(screen.getByLabelText("Color *"), { target: { value: "red" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear línea" }));

    expect(screen.getByText("El número de línea es requerido")).toBeInTheDocument();
    expect(screen.getByText("El nombre es requerido")).toBeInTheDocument();
    expect(screen.getByText(/formato hexadecimal/)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("keeps the created línea when the link fails and retries only the link", async () => {
    let linkAttempts = 0;
    const basePost = mockPost.getMockImplementation()!;
    mockPost.mockImplementation(async (path: string, data: any) => {
      if (path === "/infrastructure/lineas/50/municipalidades" && linkAttempts++ === 0) {
        throw new ApiError(500, "boom");
      }
      return basePost(path, data);
    });

    renderWizard();
    await chooseExistingMunicipalidad();
    fillLinea();
    fireEvent.click(screen.getByRole("button", { name: "Crear línea" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Error de conexión. Por favor, intente de nuevo.");
    expect(stepButton(3, "Paradas y parqueo")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Crear línea" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar vínculo" }));
    await screen.findByRole("region", { name: "Parqueo (opcional)" });

    const lineaCreates = mockPost.mock.calls.filter(([path]) => path === "/infrastructure/lineas");
    expect(lineaCreates).toHaveLength(1);
    expect(linkAttempts).toBe(2);
  });
});

describe("Step 3: Parqueo", () => {
  it("assigns an existing parqueo and clears it", async () => {
    await goToStep3();
    const section = screen.getByRole("region", { name: "Parqueo (opcional)" });
    expect(within(section).getByText("Sin parqueo asignado")).toBeInTheDocument();

    fireEvent.change(within(section).getByLabelText("Parqueo"), { target: { value: "9" } });
    fireEvent.click(within(section).getByRole("button", { name: "Asignar" }));

    await within(section).findByText("Central Norte");
    expect(mockPatch).toHaveBeenCalledWith("/infrastructure/lineas/50", { idParqueo: "9" });

    fireEvent.click(within(section).getByRole("button", { name: "Quitar" }));
    await within(section).findByText("Sin parqueo asignado");
    expect(mockPatch).toHaveBeenLastCalledWith("/infrastructure/lineas/50", { idParqueo: null });
  });

  it("requires a parqueo selection before assigning", async () => {
    await goToStep3();
    const section = screen.getByRole("region", { name: "Parqueo (opcional)" });
    fireEvent.click(within(section).getByRole("button", { name: "Asignar" }));

    expect(within(section).getByText("Seleccione un parqueo", { selector: "p" })).toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("creates a new parqueo inline and assigns it", async () => {
    await goToStep3();
    const section = screen.getByRole("region", { name: "Parqueo (opcional)" });
    fireEvent.click(within(section).getByLabelText("Crear nuevo"));
    fireEvent.change(within(section).getByLabelText("Nombre del parqueo *"), { target: { value: "Predio Mixco" } });
    fireEvent.change(within(section).getByLabelText("Dirección *"), { target: { value: "Calzada San Juan" } });
    fireEvent.change(within(section).getByLabelText("Latitud del parqueo *"), { target: { value: "14.63" } });
    fireEvent.change(within(section).getByLabelText("Longitud del parqueo *"), { target: { value: "-90.6" } });
    fireEvent.change(within(section).getByLabelText("Capacidad de unidades *"), { target: { value: "15" } });
    fireEvent.click(within(section).getByRole("button", { name: "Crear y asignar" }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("/infrastructure/lineas/50", { idParqueo: "11" }));
    expect(mockPost).toHaveBeenCalledWith("/infrastructure/parqueos", {
      nombreParqueo: "Predio Mixco",
      tipoParqueo: "CENTRAL",
      direccion: "Calzada San Juan",
      latitud: 14.63,
      longitud: -90.6,
      capacidadUnidades: 15,
      estadoParqueo: "ACTIVO",
    });
  });
});

describe("Step 3: Paradas", () => {
  it("shows an empty state explaining that a línea needs paradas", async () => {
    await goToStep3();
    expect(await screen.findByText(/Esta línea aún no tiene paradas/)).toBeInTheDocument();
  });

  it("lists the paradas in order with the Estación badge", async () => {
    await goToStep3(THREE_ROWS);
    const items = within(screen.getByRole("list", { name: "Paradas de la línea" })).getAllByRole("listitem");

    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Parada A"),
      expect.stringContaining("Parada B"),
      expect.stringContaining("Parada C"),
    ]);
    expect(within(items[1]!).getByText("Estación")).toBeInTheDocument();
    expect(within(items[0]!).queryByText("Estación")).not.toBeInTheDocument();
  });

  it("adds an existing parada (not already in the línea) at orden max + 1", async () => {
    await goToStep3(THREE_ROWS);
    const select = screen.getByLabelText("Parada existente");
    await within(select).findByRole("option", { name: "Parada D" });
    expect(within(select).queryByRole("option", { name: "Parada A" })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Minutos hasta la siguiente *"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar parada" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/infrastructure/lineas/50/paradas", {
        idParada: "4",
        orden: 4,
        minutosHastaSiguiente: 6,
      })
    );
  });

  it("creates a new parada with estación and appends it to the línea", async () => {
    await goToStep3();
    fireEvent.click(screen.getByLabelText("Crear nueva"));
    fireEvent.change(screen.getByLabelText("Nombre de la parada *"), { target: { value: "El Naranjo" } });
    fireEvent.change(screen.getByLabelText("Latitud *"), { target: { value: "14.65" } });
    fireEvent.change(screen.getByLabelText("Longitud *"), { target: { value: "-90.55" } });
    fireEvent.click(screen.getByLabelText("Es estación"));
    fireEvent.change(screen.getByLabelText("Nombre de la estación *"), { target: { value: "Estación El Naranjo" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar parada" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/infrastructure/lineas/50/paradas", {
        idParada: "77",
        orden: 1,
        minutosHastaSiguiente: 0,
      })
    );
    expect(mockPost).toHaveBeenCalledWith("/infrastructure/paradas", {
      nombreParada: "El Naranjo",
      latitud: 14.65,
      longitud: -90.55,
      estadoParada: "ACTIVA",
    });
    expect(mockPost).toHaveBeenCalledWith("/infrastructure/estaciones", {
      nombreEstacion: "Estación El Naranjo",
      latitud: 14.65,
      longitud: -90.55,
      estadoEstacion: "ACTIVA",
      idParada: 77,
    });
  });

  it("does not create the parada twice when adding it to the línea fails", async () => {
    await goToStep3();
    const basePost = mockPost.getMockImplementation()!;
    let addAttempts = 0;
    mockPost.mockImplementation(async (path: string, data: any) => {
      if (path === "/infrastructure/lineas/50/paradas" && addAttempts++ === 0) throw new ApiError(500, "boom");
      return basePost(path, data);
    });

    fireEvent.click(screen.getByLabelText("Crear nueva"));
    fireEvent.change(screen.getByLabelText("Nombre de la parada *"), { target: { value: "El Naranjo" } });
    fireEvent.change(screen.getByLabelText("Latitud *"), { target: { value: "14.65" } });
    fireEvent.change(screen.getByLabelText("Longitud *"), { target: { value: "-90.55" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar parada" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Error de conexión");

    fireEvent.click(screen.getByRole("button", { name: "Agregar parada" }));
    await waitFor(() => expect(addAttempts).toBe(2));
    expect(mockPost.mock.calls.filter(([path]) => path === "/infrastructure/paradas")).toHaveLength(1);
  });

  it("moves a parada up and down with the full reordered id list", async () => {
    await goToStep3(THREE_ROWS);

    expect(screen.getByRole("button", { name: "Subir Parada A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Parada C" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Bajar Parada A" }));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith("/infrastructure/lineas/50/paradas/orden", {
        idsLineaParada: ["102", "101", "103"],
      })
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Subir Parada B" })).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Subir Parada C" }));
    await waitFor(() =>
      expect(mockPut).toHaveBeenLastCalledWith("/infrastructure/lineas/50/paradas/orden", {
        idsLineaParada: ["102", "103", "101"],
      })
    );
  });

  it("edits the minutos hasta la siguiente of a row", async () => {
    await goToStep3(THREE_ROWS);
    const save = screen.getByRole("button", { name: "Guardar minutos de Parada A" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getAllByLabelText("Minutos hasta la siguiente")[0]!, { target: { value: "9" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/infrastructure/lineas/50/paradas/101", { minutosHastaSiguiente: 9 })
    );
  });

  it("shows the LINEA_MIN_PARADAS message when a removal is rejected", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDelete.mockRejectedValueOnce(new ApiError(409, "min", { error: "LINEA_MIN_PARADAS" }));
    await goToStep3(THREE_ROWS);

    fireEvent.click(screen.getByRole("button", { name: "Quitar Parada A" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Una línea debe tener al menos 2 paradas");
    expect(mockDelete).toHaveBeenCalledWith("/infrastructure/lineas/50/paradas/101");
  });
});

describe("Finalize and close", () => {
  it("finalizes with a summary and closes reporting saved data", async () => {
    const { onClose } = await goToStep3(THREE_ROWS);
    fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));

    const summary = screen.getByRole("region", { name: "Resumen" });
    expect(within(summary).getByText("Mixco")).toBeInTheDocument();
    expect(within(summary).getByText("L50 - Mixco Express")).toBeInTheDocument();
    expect(within(summary).getByText("3")).toBeInTheDocument();
    expect(within(summary).getByText("Sin parqueo")).toBeInTheDocument();

    fireEvent.click(within(summary).getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("closes without confirmation before anything is chosen", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { onClose } = renderWizard();
    await screen.findByLabelText("Municipalidad *");

    fireEvent.click(screen.getByRole("button", { name: "Cerrar asistente" }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("asks before closing past step 1 and stays open when cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose } = renderWizard();
    await chooseExistingMunicipalidad();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar asistente" }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("se conservarán"));
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledWith(true);
  });
});
