// odd/tasks/card-activity.md S5: staff view of each card's turnstile passes
// and recharges. The API client is mocked by path; the API contract itself is
// covered by apps/api/test/card-activity.e2e-spec.ts.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { CardActivityPage } from "../../features/card-activity";

vi.mock("../../lib/api-client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
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

const mockGet = vi.mocked(apiClient.get);
const mockPost = vi.mocked(apiClient.post);

const page = (items: { numeroTarjeta: string; saldo: number; estadoTarjeta: string }[], total = items.length, pageNumber = 1) => ({
  total,
  page: pageNumber,
  pageSize: 20,
  items,
});

const CARD_A = { numeroTarjeta: "TEST-0001", saldo: 12.5, estadoTarjeta: "ACTIVA" };
const CARD_B = { numeroTarjeta: "TEST-0002", saldo: 0, estadoTarjeta: "BLOQUEADA" };

const ACTIVITY = {
  tarjeta: CARD_A,
  pasadas: [
    {
      idEvento: "2",
      tipo: "SALIDA",
      montoCobrado: 0,
      parada: { idParada: "3", nombreParada: "Parada Centro", esEstacion: true },
      fecha: "2026-10-01T16:02:00.000Z",
    },
    {
      idEvento: "1",
      tipo: "ENTRADA",
      montoCobrado: 1,
      parada: { idParada: "5", nombreParada: "Parada Norte", esEstacion: false },
      fecha: "2026-10-01T16:01:00.000Z",
    },
  ],
  recargas: [
    {
      idTransaccion: "8",
      referencia: "ref-2",
      monto: 15,
      estadoPago: "PENDIENTE_AUTENTICACION",
      origen: "QPAYPRO",
      numeroComprobante: null,
      fecha: "2026-10-01T16:04:00.000Z",
    },
    {
      idTransaccion: "7",
      referencia: "ref-1",
      monto: 20,
      estadoPago: "APROBADA",
      origen: "SIMULADA",
      numeroComprobante: "SIM-7",
      fecha: "2026-10-01T16:03:00.000Z",
    },
  ],
};

/** Answers by path: the list for /cards?..., the activity for /cards/:n/activity. */
function routeGet(list: unknown, activity: unknown = ACTIVITY) {
  mockGet.mockImplementation(async (path: string) => {
    const value = path.includes("/activity") ? activity : list;
    if (value instanceof Error) throw value;
    return value;
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/recharges"]}>
      <Routes>
        <Route path="/recharges" element={<CardActivityPage />} />
        <Route path="/landing" element={<div>Landing destination</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("CardActivityPage", () => {
  it("lists the first page of cards with state and balance", async () => {
    routeGet(page([CARD_A, CARD_B]));
    renderPage();

    const rows = await screen.findAllByRole("row");
    expect(mockGet).toHaveBeenCalledWith("/cards?page=1");
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("TEST-0001"),
      expect.stringContaining("TEST-0002"),
    ]);
    expect(within(rows[1]!).getByText("Activa")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Q12.50")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Bloqueada")).toBeInTheDocument();
    expect(screen.getByText("Tarjetas (2)")).toBeInTheDocument();
  });

  it("searches by number after typing (debounced) from page 1", async () => {
    routeGet(page([CARD_A]));
    renderPage();
    await screen.findByText("TEST-0001");

    fireEvent.change(screen.getByLabelText("Buscar por número"), { target: { value: "  0001 " } });

    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith("/cards?search=0001&page=1"));
  });

  it("says when no card matches", async () => {
    routeGet(page([]));
    renderPage();

    expect(await screen.findByText("No hay tarjetas que coincidan.")).toBeInTheDocument();
  });

  it("pages through the cards", async () => {
    routeGet(page([CARD_A], 25));
    renderPage();
    await screen.findByText("TEST-0001");

    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith("/cards?page=2"));
  });

  it("shows the selected card's passes and recharges", async () => {
    routeGet(page([CARD_A]));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Ver actividad de TEST-0001" }));

    const detail = await screen.findByRole("region", { name: "Actividad de TEST-0001" });
    expect(mockGet).toHaveBeenCalledWith("/cards/TEST-0001/activity");
    expect(within(detail).getByText("Saldo: Q12.50")).toBeInTheDocument();

    const passes = within(within(detail).getByRole("table", { name: "Pasadas por talanquera" })).getAllByRole("row");
    expect(passes).toHaveLength(3);
    expect(within(passes[1]!).getByText("Salida")).toBeInTheDocument();
    expect(within(passes[1]!).getByText("Parada Centro (estación)")).toBeInTheDocument();
    expect(within(passes[1]!).getByText("Q0.00")).toBeInTheDocument();
    expect(within(passes[2]!).getByText("Entrada")).toBeInTheDocument();
    expect(within(passes[2]!).getByText("Parada Norte")).toBeInTheDocument();
    expect(within(passes[2]!).getByText("Q1.00")).toBeInTheDocument();

    const recharges = within(within(detail).getByRole("table", { name: "Recargas" })).getAllByRole("row");
    expect(recharges).toHaveLength(3);
    expect(within(recharges[1]!).getByText("Q15.00")).toBeInTheDocument();
    expect(within(recharges[1]!).getByText("Pendiente de autenticación")).toBeInTheDocument();
    expect(within(recharges[1]!).getByText("QPayPro")).toBeInTheDocument();
    expect(within(recharges[1]!).getByText("—")).toBeInTheDocument();
    expect(within(recharges[2]!).getByText("Aprobada")).toBeInTheDocument();
    expect(within(recharges[2]!).getByText("Simulada")).toBeInTheDocument();
    expect(within(recharges[2]!).getByText("SIM-7")).toBeInTheDocument();
  });

  it("encodes the card number in the activity request", async () => {
    routeGet(page([{ ...CARD_A, numeroTarjeta: "A/B 1" }]), { ...ACTIVITY, tarjeta: { ...CARD_A, numeroTarjeta: "A/B 1" } });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Ver actividad de A/B 1" }));

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/cards/A%2FB%201/activity"));
  });

  // Verifier probe: a late answer for a card no longer selected is ignored.
  it("ignores a late activity response for a card that is no longer selected", async () => {
    let releaseFirst: (value: unknown) => void = () => {};
    mockGet.mockImplementation(async (path: string) => {
      if (path === "/cards/TEST-0001/activity") return new Promise((resolve) => (releaseFirst = resolve));
      if (path === "/cards/TEST-0002/activity") return { tarjeta: CARD_B, pasadas: [], recargas: [] };
      return page([CARD_A, CARD_B]);
    });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Ver actividad de TEST-0001" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver actividad de TEST-0002" }));
    await screen.findByRole("region", { name: "Actividad de TEST-0002" });
    await act(async () => releaseFirst(ACTIVITY));

    expect(screen.getByRole("region", { name: "Actividad de TEST-0002" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Actividad de TEST-0001" })).not.toBeInTheDocument();
  });

  it("names the card list table", async () => {
    routeGet(page([CARD_A]));
    renderPage();

    expect(await screen.findByRole("table", { name: "Tarjetas" })).toBeInTheDocument();
  });

  it("says when the card has no passes or recharges", async () => {
    routeGet(page([CARD_B]), { tarjeta: CARD_B, pasadas: [], recargas: [] });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Ver actividad de TEST-0002" }));

    expect(await screen.findByText("Sin pasadas registradas.")).toBeInTheDocument();
    expect(screen.getByText("Sin recargas registradas.")).toBeInTheDocument();
  });

  it("shows a message when the list cannot be loaded", async () => {
    routeGet(new ApiError(403, "Forbidden"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("No tiene permiso para consultar las tarjetas.");
  });

  it("shows a message when the activity cannot be loaded", async () => {
    routeGet(page([CARD_A]), new ApiError(404, "La tarjeta no existe."));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Ver actividad de TEST-0001" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La tarjeta no existe.");
  });

  describe("Verificar con QPayPro (qpaypro-checkout S11)", () => {
    const qpp = (idTransaccion: string, estadoPago: string, origen = "QPAYPRO", referencia = `QPP-${idTransaccion}`) => ({
      idTransaccion,
      referencia,
      monto: 25,
      estadoPago,
      origen,
      numeroComprobante: null,
      fecha: "2026-10-01T16:05:00.000Z",
    });
    const QPP_ACTIVITY = {
      tarjeta: CARD_A,
      pasadas: [],
      recargas: [
        qpp("21", "INICIADA", "QPAYPRO", "QPP-a/b"),
        qpp("22", "EXPIRADA"),
        qpp("23", "APROBADA"),
        qpp("24", "RECHAZADA"),
        qpp("25", "ERROR"),
        qpp("26", "PENDIENTE_AUTENTICACION"),
        qpp("27", "INICIADA", "SIMULADA", "sim-27"),
        qpp("28", "EXPIRADA", "SIMULADA", "sim-28"),
      ],
    };
    const VERIFY = "Verificar con QPayPro";

    async function openCard() {
      routeGet(page([CARD_A]), QPP_ACTIVITY);
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: "Ver actividad de TEST-0001" }));
      const detail = await screen.findByRole("region", { name: "Actividad de TEST-0001" });
      const rows = within(within(detail).getByRole("table", { name: "Recargas" })).getAllByRole("row").slice(1);
      return { detail, rows };
    }

    it("shows the button only on QPayPro rows that are INICIADA or EXPIRADA", async () => {
      const { rows } = await openCard();

      expect(rows.map((row) => within(row).queryByRole("button", { name: VERIFY }) !== null)).toEqual([
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    });

    it("POSTs the verify request and updates the row and the balance with the answer", async () => {
      mockPost.mockResolvedValue({
        referencia: "QPP-a/b",
        numeroTarjeta: "TEST-0001",
        monto: 25,
        estadoPago: "APROBADA",
        numeroComprobante: "QPP-REC-9",
        saldo: 37.5,
      });
      const { detail, rows } = await openCard();

      fireEvent.click(within(rows[0]!).getByRole("button", { name: VERIFY }));

      expect(await within(rows[0]!).findByText("QPP-REC-9")).toBeInTheDocument();
      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost).toHaveBeenCalledWith("/cards/TEST-0001/payments/QPP-a%2Fb/verify", {});
      expect(within(rows[0]!).getByText("Aprobada")).toBeInTheDocument();
      expect(within(rows[0]!).queryByRole("button", { name: VERIFY })).not.toBeInTheDocument();
      expect(within(detail).getByText("Saldo: Q37.50")).toBeInTheDocument();
      expect(within(rows[1]!).getByText("Expirada")).toBeInTheDocument();
      expect(within(rows[1]!).getByRole("button", { name: VERIFY })).toBeEnabled();
    });

    it("keeps the button when QPayPro could not confirm the payment", async () => {
      mockPost.mockResolvedValue({
        referencia: "QPP-22",
        numeroTarjeta: "TEST-0001",
        monto: 25,
        estadoPago: "EXPIRADA",
        numeroComprobante: null,
        saldo: 12.5,
      });
      const { detail, rows } = await openCard();

      fireEvent.click(within(rows[1]!).getByRole("button", { name: VERIFY }));

      await waitFor(() => expect(within(rows[1]!).getByRole("button", { name: VERIFY })).toBeEnabled());
      expect(mockPost).toHaveBeenCalledWith("/cards/TEST-0001/payments/QPP-22/verify", {});
      expect(within(rows[1]!).getByText("Expirada")).toBeInTheDocument();
      expect(within(detail).getByText("Saldo: Q12.50")).toBeInTheDocument();
      expect(within(detail).queryByRole("alert")).not.toBeInTheDocument();
    });

    it("disables the button while sending", async () => {
      let release: (value: unknown) => void = () => {};
      mockPost.mockImplementation(() => new Promise((resolve) => (release = resolve)));
      const { rows } = await openCard();
      const button = within(rows[1]!).getByRole("button", { name: VERIFY });

      fireEvent.click(button);

      await waitFor(() => expect(button).toBeDisabled());
      fireEvent.click(button);
      expect(mockPost).toHaveBeenCalledTimes(1);
      await act(async () =>
        release({ referencia: "QPP-22", numeroTarjeta: "TEST-0001", monto: 25, estadoPago: "RECHAZADA", numeroComprobante: null, saldo: 12.5 }),
      );
      expect(within(rows[1]!).getByText("Rechazada")).toBeInTheDocument();
      expect(within(rows[1]!).queryByRole("button", { name: VERIFY })).not.toBeInTheDocument();
    });

    it.each([
      ["the API message of a 404", new ApiError(404, "El pago no existe."), "El pago no existe."],
      ["a permission message for a 403", new ApiError(403, "Forbidden"), "No tiene permiso para consultar las tarjetas."],
      ["a generic message for a 500", new ApiError(500, "Internal server error"), "No se pudo verificar el pago con QPayPro."],
      ["a connection message for a network error", new TypeError("Failed to fetch"), "No se pudo conectar con el servidor. Intente de nuevo."],
    ])("shows %s and leaves the row unchanged", async (_label, error, message) => {
      mockPost.mockRejectedValue(error);
      const { detail, rows } = await openCard();

      fireEvent.click(within(rows[0]!).getByRole("button", { name: VERIFY }));

      expect(await within(detail).findByRole("alert")).toHaveTextContent(message);
      expect(within(rows[0]!).getByText("Iniciada")).toBeInTheDocument();
      expect(within(rows[0]!).getByRole("button", { name: VERIFY })).toBeEnabled();
      expect(within(detail).getByText("Saldo: Q12.50")).toBeInTheDocument();
    });
  });

  it("navigates back to the landing page", async () => {
    routeGet(page([]));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(await screen.findByText("Landing destination")).toBeInTheDocument();
  });
});
