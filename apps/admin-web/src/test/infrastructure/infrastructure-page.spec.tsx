import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InfrastructurePage } from "../../features/infrastructure";
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

import { apiClient } from "../../lib/api-client";

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);
const mockDelete = vi.mocked(apiClient.delete);
const mockPatch = vi.mocked(apiClient.patch);

const MIXCO = { idMunicipalidad: "1", nombreMunicipalidad: "Mixco", departamento: "Guatemala", estadoMunicipalidad: "ACTIVA" };
// Every list an activate/deactivate cascade can change (L10).
const CASCADE_LISTS = [
  "/infrastructure/municipalidades",
  "/infrastructure/lineas",
  "/infrastructure/paradas",
  "/infrastructure/estaciones",
  "/infrastructure/afectaciones",
];

async function expectRefetched(before: number[]) {
  await waitFor(() => {
    CASCADE_LISTS.forEach((path, i) => expect(getCalls(path), path).toBeGreaterThan(before[i]!));
  });
}

// Numeric id on purpose: ids may arrive as numbers or strings.
const VILLA = { idMunicipalidad: 2, nombreMunicipalidad: "Villa Nueva", departamento: "Guatemala", estadoMunicipalidad: "INACTIVA" };

function linea(idLinea: string, numeroLinea: string, nombreLinea: string, idParqueo: string | null = null) {
  return { idLinea, numeroLinea, nombreLinea, colorHex: "#FF0000", tipoRecorrido: "LINEAL", idParqueo, estadoLinea: "ACTIVA" };
}

const L1 = linea("10", "L1", "Mixco Express", "9");
const L2 = linea("20", "L2", "Villa Centro");
const L3 = linea("30", "L3", "Ruta Antigua");

const PARQUEOS = [
  { idParqueo: "9", nombreParqueo: "Central Norte", tipoParqueo: "CENTRAL", direccion: "Zona 18", latitud: 14.6, longitud: -90.5, capacidadUnidades: 20, estadoParqueo: "ACTIVO" },
];

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

const PARADAS = [parada(1, "Parada A"), parada(2, "Parada B", true)];

function row(idLineaParada: string, orden: number, p: Parada, minutos = 5): LineaParada {
  const { esEstacion: _e, idEstacion: _i, ...bare } = p;
  return { idLineaParada, orden, minutosHastaSiguiente: minutos, idParada: String(p.idParada), idLinea: "10", parada: bare };
}

let municipalidades: unknown[] = [];
let lineas: unknown[] = [];
let afectaciones: unknown[] = [];
let failures: Set<string>;

function getCalls(path: string) {
  return mockGet.mock.calls.filter(([p]) => p === path).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  municipalidades = [MIXCO, VILLA];
  lineas = [L1, L2, L3];
  afectaciones = [];
  failures = new Set();
  mockGet.mockImplementation(async (path: string) => {
    if (failures.has(path)) {
      failures.delete(path);
      throw new Error("network");
    }
    switch (path) {
      case "/infrastructure/municipalidades":
        return municipalidades;
      case "/infrastructure/municipalidades/1/lineas":
        return [L1];
      case "/infrastructure/municipalidades/2/lineas":
        return [L2];
      case "/infrastructure/lineas":
        return lineas;
      case "/infrastructure/parqueos":
        return PARQUEOS;
      case "/infrastructure/paradas":
        return PARADAS;
      case "/infrastructure/afectaciones":
        return afectaciones;
      case "/infrastructure/lineas/10/paradas":
        return [row("101", 1, PARADAS[0]!, 7), row("102", 2, PARADAS[1]!)];
      default:
        return [];
    }
  });
  mockDelete.mockResolvedValue(undefined);
  mockPost.mockImplementation(async (path: string, data: any) => {
    if (path === "/infrastructure/municipalidades") return { idMunicipalidad: "7", estadoMunicipalidad: "ACTIVA", ...data };
    throw new Error(`Unexpected POST ${path}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <InfrastructurePage />
    </MemoryRouter>,
  );
}

async function findGroup(name: string) {
  return screen.findByRole("region", { name });
}

async function findLinea(group: HTMLElement, label: string) {
  return within(group).findByRole("article", { name: `Línea ${label}` });
}

async function expandL1() {
  const mixco = await findGroup("Mixco");
  const card = await findLinea(mixco, "L1 - Mixco Express");
  fireEvent.click(within(card).getByRole("button", { name: "Ver paradas de la línea L1 - Mixco Express" }));
  await within(card).findByRole("list", { name: "Paradas de la línea L1 - Mixco Express" });
  return card;
}

describe("InfrastructurePage grouped view", () => {
  it("replaces the tabs with one card per municipalidad listing its líneas", async () => {
    renderPage();

    const mixco = await findGroup("Mixco");
    const villa = await findGroup("Villa Nueva");
    expect(await findLinea(mixco, "L1 - Mixco Express")).toBeInTheDocument();
    expect(within(mixco).queryByRole("article", { name: /L2/ })).not.toBeInTheDocument();
    expect(await findLinea(villa, "L2 - Villa Centro")).toBeInTheDocument();

    // Municipalidad and línea estado badges.
    expect(within(mixco).getAllByText("ACTIVA")).toHaveLength(2);
    expect(within(villa).getByText("INACTIVA")).toBeInTheDocument();
    expect(within(mixco).getByText("1 línea")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Municipalidades \(\d+\)$/ })).not.toBeInTheDocument();
    // One request per municipalidad.
    expect(getCalls("/infrastructure/municipalidades/1/lineas")).toBe(1);
    expect(getCalls("/infrastructure/municipalidades/2/lineas")).toBe(1);
  });

  it("shows each línea's parqueo, tipo de recorrido and estado", async () => {
    renderPage();

    const l1 = await findLinea(await findGroup("Mixco"), "L1 - Mixco Express");
    await within(l1).findByText(/Central Norte/);
    expect(within(l1).getByText(/Lineal/)).toBeInTheDocument();
    const l2 = await findLinea(await findGroup("Villa Nueva"), "L2 - Villa Centro");
    expect(within(l2).getByText(/Sin parqueo/)).toBeInTheDocument();
  });

  it("puts líneas linked to no municipalidad under 'Sin municipalidad' with a hint", async () => {
    renderPage();

    const sin = await findGroup("Sin municipalidad");
    expect(await findLinea(sin, "L3 - Ruta Antigua")).toBeInTheDocument();
    expect(within(sin).queryByRole("article", { name: /L1|L2/ })).not.toBeInTheDocument();
    expect(within(sin).getByText(/provienen de datos anteriores/)).toBeInTheDocument();

    fireEvent.click(within(sin).getByRole("button", { name: "Vincular municipalidad de la línea L3 - Ruta Antigua" }));
    expect(screen.getByRole("dialog", { name: "Municipalidades de la línea" })).toBeInTheDocument();
  });

  it("regroups after the municipalidades dialog closes", async () => {
    renderPage();
    const sin = await findGroup("Sin municipalidad");
    fireEvent.click(within(sin).getByRole("button", { name: "Vincular municipalidad de la línea L3 - Ruta Antigua" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Municipalidades de la línea" })).getByRole("button", { name: "Cerrar" }));

    await waitFor(() => expect(getCalls("/infrastructure/municipalidades/1/lineas")).toBe(2));
    expect(getCalls("/infrastructure/municipalidades/2/lineas")).toBe(2);
  });

  it("filters by municipalidad name, línea name or número", async () => {
    renderPage();
    await findLinea(await findGroup("Sin municipalidad"), "L3 - Ruta Antigua");
    const searchBox = screen.getByRole("searchbox", { name: "Buscar municipalidad o línea" });

    fireEvent.change(searchBox, { target: { value: "villa" } });
    expect(screen.queryByRole("region", { name: "Mixco" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Villa Nueva" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sin municipalidad" })).not.toBeInTheDocument();

    fireEvent.change(searchBox, { target: { value: "l3" } });
    expect(screen.queryByRole("region", { name: "Villa Nueva" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sin municipalidad" })).toBeInTheDocument();

    fireEvent.change(searchBox, { target: { value: "express" } });
    expect(within(screen.getByRole("region", { name: "Mixco" })).getByRole("article", { name: "Línea L1 - Mixco Express" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Villa Nueva" })).not.toBeInTheDocument();

    fireEvent.change(searchBox, { target: { value: "zzz" } });
    expect(screen.getByText("No hay municipalidades ni líneas que coincidan con «zzz».")).toBeInTheDocument();
  });

  it("collapses and expands a municipalidad card", async () => {
    renderPage();
    const mixco = await findGroup("Mixco");
    await findLinea(mixco, "L1 - Mixco Express");
    const toggle = within(mixco).getByRole("button", { name: "Mixco" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(mixco).queryByRole("article")).not.toBeInTheDocument();
  });

  it("loads a línea's paradas only when it is expanded, in order with Estación badge and minutos", async () => {
    renderPage();
    const mixco = await findGroup("Mixco");
    const card = await findLinea(mixco, "L1 - Mixco Express");
    expect(getCalls("/infrastructure/lineas/10/paradas")).toBe(0);

    const toggle = within(card).getByRole("button", { name: "Ver paradas de la línea L1 - Mixco Express" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const list = await within(card).findByRole("list", { name: "Paradas de la línea L1 - Mixco Express" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Parada A");
    expect(items[0]).toHaveTextContent("7 min a la siguiente");
    expect(items[1]).toHaveTextContent("Parada B");
    expect(within(items[1]!).getByText("Estación")).toBeInTheDocument();
    expect(within(card).getByText("2 paradas")).toBeInTheDocument();
    expect(getCalls("/infrastructure/lineas/10/paradas")).toBe(1);
  });

  it("shows a paradas load error with Reintentar", async () => {
    failures.add("/infrastructure/lineas/10/paradas");
    renderPage();
    const card = await findLinea(await findGroup("Mixco"), "L1 - Mixco Express");
    fireEvent.click(within(card).getByRole("button", { name: "Ver paradas de la línea L1 - Mixco Express" }));

    const alert = await within(card).findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await within(card).findByRole("list", { name: "Paradas de la línea L1 - Mixco Express" })).toBeInTheDocument();
  });
});

describe("InfrastructurePage actions", () => {
  it("opens the municipalidad, línea and línea-municipalidades dialogs", async () => {
    renderPage();
    const mixco = await findGroup("Mixco");
    await findLinea(mixco, "L1 - Mixco Express");

    fireEvent.click(within(mixco).getByRole("button", { name: "Editar municipalidad Mixco" }));
    expect(screen.getByRole("dialog", { name: "Editar Municipalidad" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(within(mixco).getByRole("button", { name: "Editar línea L1 - Mixco Express" }));
    expect(screen.getByRole("heading", { name: "Editar Línea" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(within(mixco).getByRole("button", { name: "Municipalidades de la línea L1 - Mixco Express" }));
    expect(screen.getByRole("dialog", { name: "Municipalidades de la línea" })).toBeInTheDocument();
  });

  it("opens the parada, accesos and estación-líneas dialogs from an expanded línea", async () => {
    renderPage();
    const card = await expandL1();

    fireEvent.click(within(card).getByRole("button", { name: "Editar parada Parada A" }));
    expect(screen.getByRole("heading", { name: "Editar Parada" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Es estación/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(within(card).getByRole("button", { name: "Accesos de la parada Parada A" }));
    expect(screen.getByRole("dialog", { name: "Accesos de la parada" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Accesos de la parada" })).getByRole("button", { name: "Cerrar" }));

    expect(within(card).queryByRole("button", { name: "Líneas de la estación Parada A" })).not.toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Líneas de la estación Parada B" }));
    expect(screen.getByRole("dialog", { name: "Líneas de la estación" })).toBeInTheDocument();
  });

  it("deactivates a municipalidad and a línea after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    const mixco = await findGroup("Mixco");
    await findLinea(mixco, "L1 - Mixco Express");

    fireEvent.click(within(mixco).getByRole("button", { name: "Desactivar municipalidad Mixco" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/infrastructure/municipalidades/1"));

    fireEvent.click(within(mixco).getByRole("button", { name: "Desactivar línea L1 - Mixco Express" }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/infrastructure/lineas/10"));
    // Already inactive: no "Desactivar".
    expect(within(await findGroup("Villa Nueva")).queryByRole("button", { name: "Desactivar municipalidad Villa Nueva" })).not.toBeInTheDocument();
  });

  it("refreshes every cascaded list after deactivating a municipalidad", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    const mixco = await findGroup("Mixco");
    await findLinea(mixco, "L1 - Mixco Express");
    const before = CASCADE_LISTS.map(getCalls);

    fireEvent.click(within(mixco).getByRole("button", { name: "Desactivar municipalidad Mixco" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("/infrastructure/municipalidades/1"));
    await expectRefetched(before);
  });

  it("refreshes every cascaded list after editing a municipalidad", async () => {
    mockPatch.mockResolvedValue({ ...MIXCO, estadoMunicipalidad: "INACTIVA" });
    renderPage();
    const mixco = await findGroup("Mixco");
    await findLinea(mixco, "L1 - Mixco Express");

    fireEvent.click(within(mixco).getByRole("button", { name: "Editar municipalidad Mixco" }));
    const dialog = screen.getByRole("dialog", { name: "Editar Municipalidad" });
    const before = CASCADE_LISTS.map(getCalls);
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockPatch).toHaveBeenCalledWith("/infrastructure/municipalidades/1", expect.any(Object)));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar Municipalidad" })).not.toBeInTheDocument());
    await expectRefetched(before);
  });

  it("shows a Spanish error when deactivating fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDelete.mockRejectedValueOnce(new Error("Error de conexión. Por favor, intente de nuevo."));
    renderPage();
    const mixco = await findGroup("Mixco");

    fireEvent.click(within(mixco).getByRole("button", { name: "Desactivar municipalidad Mixco" }));
    expect(await screen.findByText("Error de conexión. Por favor, intente de nuevo.")).toBeInTheDocument();
  });

  it("'Gestionar paradas y parqueo' opens the wizard at step 3 for that línea and reloads on close", async () => {
    renderPage();
    const card = await expandL1();
    const lineasCalls = getCalls("/infrastructure/lineas");

    fireEvent.click(within(card).getByRole("button", { name: "Gestionar paradas y parqueo de la línea L1 - Mixco Express" }));
    const wizard = screen.getByRole("dialog", { name: "Gestionar paradas y parqueo" });
    expect(within(wizard).getByText(/Línea L1 - Mixco Express · Mixco/)).toBeInTheDocument();
    expect(within(wizard).queryByRole("navigation", { name: "Pasos del asistente" })).not.toBeInTheDocument();
    expect(await within(wizard).findByRole("list", { name: "Paradas de la línea" })).toBeInTheDocument();
    expect(within(wizard).getByRole("button", { name: "Finalizar" })).toBeInTheDocument();

    fireEvent.click(within(wizard).getByRole("button", { name: "Cerrar asistente" }));
    expect(screen.queryByRole("dialog", { name: "Gestionar paradas y parqueo" })).not.toBeInTheDocument();
    await waitFor(() => expect(getCalls("/infrastructure/lineas")).toBeGreaterThan(lineasCalls));
  });

  it("opens 'Gestionar paradas y parqueo' for a línea without municipalidad", async () => {
    renderPage();
    const sin = await findGroup("Sin municipalidad");
    const card = await findLinea(sin, "L3 - Ruta Antigua");
    fireEvent.click(within(card).getByRole("button", { name: "Ver paradas de la línea L3 - Ruta Antigua" }));
    fireEvent.click(await within(card).findByRole("button", { name: "Gestionar paradas y parqueo de la línea L3 - Ruta Antigua" }));

    const wizard = screen.getByRole("dialog", { name: "Gestionar paradas y parqueo" });
    expect(within(wizard).getByText(/Línea L3 - Ruta Antigua · Sin municipalidad/)).toBeInTheDocument();
  });
});

describe("InfrastructurePage states", () => {
  it("shows an empty state pointing to 'Nueva infraestructura' when there are no municipalidades", async () => {
    municipalidades = [];
    renderPage();

    const empty = await screen.findByRole("region", { name: "Sin municipalidades" });
    expect(within(empty).getByText(/Use «Nueva infraestructura» para comenzar/)).toBeInTheDocument();
    // Seeded líneas still appear, all under "Sin municipalidad".
    const sin = await findGroup("Sin municipalidad");
    expect(within(sin).getAllByRole("article")).toHaveLength(3);

    fireEvent.click(within(empty).getByRole("button", { name: "Nueva infraestructura" }));
    expect(screen.getByRole("dialog", { name: "Nueva infraestructura" })).toBeInTheDocument();
  });

  it("shows the municipalidades load error with Reintentar", async () => {
    failures.add("/infrastructure/municipalidades");
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Error de conexión. Por favor, intente de nuevo.");
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await findGroup("Mixco")).toBeInTheDocument();
  });

  it("shows a per-municipalidad error with Reintentar and hides 'Sin municipalidad' until it loads", async () => {
    failures.add("/infrastructure/municipalidades/2/lineas");
    renderPage();

    const villa = await findGroup("Villa Nueva");
    const alert = await within(villa).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar las líneas de la municipalidad.");
    expect(screen.queryByRole("region", { name: "Sin municipalidad" })).not.toBeInTheDocument();

    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await findLinea(villa, "L2 - Villa Centro")).toBeInTheDocument();
    expect(await findGroup("Sin municipalidad")).toBeInTheDocument();
  });
});

describe("InfrastructurePage secondary sections and creation", () => {
  it("keeps parqueos, all paradas and afectaciones reachable", async () => {
    renderPage();
    const secondary = screen.getByRole("region", { name: "Otros registros" });

    expect(await within(secondary).findByText("Central Norte")).toBeInTheDocument();
    expect(within(secondary).getByText(/Los parqueos se crean/)).toBeInTheDocument();

    fireEvent.click(within(secondary).getByRole("button", { name: "Todas las paradas (2)" }));
    expect(within(secondary).getByPlaceholderText("Buscar parada...")).toBeInTheDocument();

    expect(within(secondary).queryByRole("button", { name: "Nueva afectación" })).not.toBeInTheDocument();
    fireEvent.click(within(secondary).getByRole("button", { name: "Afectaciones (0)" }));
    expect(within(secondary).getByRole("button", { name: "Afectaciones (0)" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(secondary).getByRole("button", { name: "Nueva afectación" }));
    expect(screen.getByText("Nueva Afectación")).toBeInTheDocument();
  });

  async function openAfectacionDialog() {
    renderPage();
    const secondary = screen.getByRole("region", { name: "Otros registros" });
    await within(secondary).findByText("Central Norte");
    fireEvent.click(within(secondary).getByRole("button", { name: "Afectaciones (0)" }));
    fireEvent.click(within(secondary).getByRole("button", { name: "Nueva afectación" }));
    const dialog = screen.getByRole("dialog", { name: "Nueva Afectación" });
    fireEvent.change(await within(dialog).findByLabelText("Línea *"), { target: { value: "10" } });
    fireEvent.change(within(dialog).getByLabelText("Motivo *"), { target: { value: "Desfile" } });
    fireEvent.change(within(dialog).getByLabelText("Fecha inicio *"), { target: { value: "2026-04-01" } });
    return dialog;
  }

  it("creates an afectación, closes the dialog and refreshes every cascaded list", async () => {
    mockPost.mockResolvedValueOnce({ idAfectacion: "5" });
    const dialog = await openAfectacionDialog();
    const before = CASCADE_LISTS.map(getCalls);

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nueva Afectación" })).not.toBeInTheDocument());
    expect(mockPost).toHaveBeenCalledWith("/infrastructure/afectaciones", {
      accion: "DESACTIVAR",
      motivo: "Desfile",
      fechaInicio: "2026-04-01",
      idLinea: "10",
    });
    await expectRefetched(before);
  });

  it("edits an afectación from its row with a PATCH of the changed fields and refreshes every cascaded list", async () => {
    afectaciones = [
      {
        idAfectacion: "5",
        accion: "DESACTIVAR",
        motivo: "Desfile",
        fechaInicio: "2026-04-01",
        fechaFin: null,
        idMunicipalidad: null,
        idLinea: "10",
        idParada: null,
        idEstacion: null,
        cambios: [{ entidadTipo: "linea", entidadId: "10", estadoAnterior: "ACTIVA", estadoNuevo: "INACTIVA", revertido: false }],
      },
    ];
    mockPatch.mockResolvedValueOnce({ ...(afectaciones[0] as object), accion: "ACTIVAR" });
    renderPage();
    const secondary = screen.getByRole("region", { name: "Otros registros" });
    await within(secondary).findByText("Central Norte");
    fireEvent.click(await within(secondary).findByRole("button", { name: "Afectaciones (1)" }));
    fireEvent.click(within(secondary).getByRole("button", { name: /^Editar afectación/ }));

    const dialog = screen.getByRole("dialog", { name: "Editar Afectación" });
    expect(within(dialog).getByLabelText("Línea *")).toHaveValue("10");
    expect(within(dialog).getByLabelText("Línea *")).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Activar" }));
    fireEvent.change(within(dialog).getByLabelText("Fecha fin"), { target: { value: "2026-04-03" } });
    const before = CASCADE_LISTS.map(getCalls);
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Editar Afectación" })).not.toBeInTheDocument());
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith("/infrastructure/afectaciones/5", { accion: "ACTIVAR", fechaFin: "2026-04-03" });
    expect(mockPost).not.toHaveBeenCalled();
    await expectRefetched(before);
  });

  it("keeps the edit dialog open with the 409 message when the API rejects the edit", async () => {
    afectaciones = [
      {
        idAfectacion: "5",
        accion: "DESACTIVAR",
        motivo: "Desfile",
        fechaInicio: "2026-04-01",
        fechaFin: null,
        idMunicipalidad: null,
        idLinea: "10",
        idParada: null,
        idEstacion: null,
        cambios: [],
      },
    ];
    mockPatch.mockRejectedValueOnce(new Error("Solo la afectación más reciente de este objetivo puede cambiar de acción"));
    renderPage();
    const secondary = screen.getByRole("region", { name: "Otros registros" });
    await within(secondary).findByText("Central Norte");
    fireEvent.click(await within(secondary).findByRole("button", { name: "Afectaciones (1)" }));
    fireEvent.click(within(secondary).getByRole("button", { name: /^Editar afectación/ }));
    const dialog = screen.getByRole("dialog", { name: "Editar Afectación" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Activar" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Solo la afectación más reciente de este objetivo puede cambiar de acción",
    );
    expect(screen.getByRole("dialog", { name: "Editar Afectación" })).toBeInTheDocument();
  });

  it("keeps the afectación dialog open with the server message when the API rejects it", async () => {
    mockPost.mockRejectedValueOnce(new Error("La línea ya está inactiva"));
    const dialog = await openAfectacionDialog();

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("La línea ya está inactiva");
    expect(screen.getByRole("dialog", { name: "Nueva Afectación" })).toBeInTheDocument();
  });

  it("opens the wizard from 'Nueva infraestructura' and closes it without reloading when nothing was saved", async () => {
    renderPage();
    await findLinea(await findGroup("Mixco"), "L1 - Mixco Express");
    // The wizard loads its own lists; the page-only membership request tells a reload apart.
    const membership = "/infrastructure/municipalidades/1/lineas";
    const before = getCalls(membership);

    fireEvent.click(screen.getAllByRole("button", { name: "Nueva infraestructura" })[0]!);
    expect(screen.getByRole("dialog", { name: "Nueva infraestructura" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cerrar asistente" }));
    expect(screen.queryByRole("dialog", { name: "Nueva infraestructura" })).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getCalls(membership)).toBe(before);
  });

  it("reloads the page data after closing a wizard that saved data", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await findLinea(await findGroup("Mixco"), "L1 - Mixco Express");

    fireEvent.click(screen.getAllByRole("button", { name: "Nueva infraestructura" })[0]!);
    const wizard = screen.getByRole("dialog", { name: "Nueva infraestructura" });
    fireEvent.click(within(wizard).getByLabelText("Crear nueva"));
    fireEvent.change(within(wizard).getByLabelText("Nombre *"), { target: { value: "Villa Nueva 2" } });
    fireEvent.change(within(wizard).getByLabelText("Departamento *"), { target: { value: "Guatemala" } });
    fireEvent.click(within(wizard).getByRole("button", { name: "Continuar" }));
    await within(wizard).findByRole("button", { name: "Crear línea" });

    // The wizard fetches with its own hooks: count only what happens after closing it.
    const paths = [
      "/infrastructure/municipalidades",
      "/infrastructure/lineas",
      "/infrastructure/paradas",
      "/infrastructure/parqueos",
      "/infrastructure/estaciones",
      "/infrastructure/municipalidades/1/lineas",
    ];
    const before = paths.map(getCalls);
    fireEvent.click(within(wizard).getByRole("button", { name: "Cerrar asistente" }));

    expect(screen.queryByRole("dialog", { name: "Nueva infraestructura" })).not.toBeInTheDocument();
    await waitFor(() => {
      paths.forEach((path, i) => expect(getCalls(path)).toBeGreaterThan(before[i]!));
    });
  });
});
