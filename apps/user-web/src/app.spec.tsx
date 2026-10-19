// odd/tasks/user-web.md S8-S10 and odd/tasks/qpaypro-checkout.md S9-S10. fetch is mocked: each test queues the API
// answers it expects, in order, and asserts the requests the app sent.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./app";

const API = "http://localhost:3000";
const CARD = { numeroTarjeta: "TEST-0001", saldo: 12.5, estadoTarjeta: "ACTIVA" };

type Answer = { status: number; body?: unknown } | "network-error" | Promise<never>;

let answers: Answer[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  answers = [];
  fetchMock = vi.fn(async () => {
    const next = answers.shift();
    if (next === undefined) throw new Error("unexpected fetch");
    if (next === "network-error") throw new TypeError("Failed to fetch");
    if (next instanceof Promise) return next;
    return json(next.status, next.body ?? {});
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_TURNSTILE_SIMULATOR", "false");
  vi.stubEnv("VITE_RECHARGE_SIMULATOR", "false");
  vi.stubEnv("VITE_TURNSTILE_API_KEY", "dev-key-123");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});

const call = (index: number) => {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit | undefined];
  return {
    url,
    method: init?.method ?? "GET",
    headers: new Headers(init?.headers),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
};

async function openCard(card = CARD) {
  answers.push({ status: 200, body: card });
  fireEvent.change(screen.getByLabelText("Número de tarjeta"), { target: { value: `  ${card.numeroTarjeta} ` } });
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  await screen.findByText("Q12.50");
}

describe("card screen (S8)", () => {
  it("looks up the trimmed card number and shows number, state and balance", async () => {
    render(<App />);

    await openCard();

    expect(call(0)).toMatchObject({ url: `${API}/citizen/cards/TEST-0001`, method: "GET" });
    expect(screen.getByText("TEST-0001")).toBeInTheDocument();
    expect(screen.getByText("ACTIVA")).toBeInTheDocument();
  });

  it("shows the API message for an unknown card", async () => {
    render(<App />);
    answers.push({ status: 404, body: { message: "La tarjeta no existe." } });

    fireEvent.change(screen.getByLabelText("Número de tarjeta"), { target: { value: "NOPE" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText("La tarjeta no existe.")).toBeInTheDocument();
    expect(screen.queryByText(/^Q\d/)).not.toBeInTheDocument();
  });

  it("does not send an empty card number", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Número de tarjeta"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ingrese el número de tarjeta.")).toBeInTheDocument();
  });

  it("goes back to the lookup with 'Consultar otra tarjeta'", async () => {
    render(<App />);
    await openCard();

    fireEvent.click(screen.getByRole("button", { name: "Consultar otra tarjeta" }));

    expect(screen.getByLabelText("Número de tarjeta")).toBeInTheDocument();
    expect(screen.queryByText("Q12.50")).not.toBeInTheDocument();
  });
});

describe("simulated recharge (user-web S9, behind VITE_RECHARGE_SIMULATOR)", () => {
  beforeEach(() => vi.stubEnv("VITE_RECHARGE_SIMULATOR", "true"));

  const recharge = async (amount: string) => {
    fireEvent.change(screen.getByLabelText("Monto a recargar (Q)"), { target: { value: amount } });
    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));
  };
  const receipt = (saldo: number) => ({
    idRecarga: "9",
    numeroComprobante: "SIM-9",
    monto: 20,
    saldo,
    fechaRecarga: "2026-10-15T10:00:00.000Z",
    repetida: false,
  });

  it("states that the recharge is simulated", async () => {
    render(<App />);
    await openCard();

    expect(screen.getByText(/recarga simulada/i)).toBeInTheDocument();
  });

  it("sends amount and a referencia, then shows the receipt and the new balance", async () => {
    render(<App />);
    await openCard();
    answers.push({ status: 201, body: receipt(32.5) });

    await recharge("20");

    expect(await screen.findByText("Recarga exitosa")).toBeInTheDocument();
    expect(screen.getByText("SIM-9")).toBeInTheDocument();
    expect(screen.getByText("Q32.50")).toBeInTheDocument();
    const sent = call(1);
    expect(sent).toMatchObject({ url: `${API}/citizen/cards/TEST-0001/recharges`, method: "POST" });
    expect(sent.body.monto).toBe(20);
    expect(sent.body.referencia).toMatch(/^[A-Za-z0-9-]{8,100}$/);
  });

  it("disables the button while sending", async () => {
    render(<App />);
    await openCard();
    let release: (r: Response) => void = () => {};
    answers.push(new Promise<never>((resolve) => (release = resolve as never)));

    await recharge("20");

    expect(screen.getByRole("button", { name: "Recargando..." })).toBeDisabled();
    await act(async () => release(json(201, receipt(32.5))));
    expect(await screen.findByText("Recarga exitosa")).toBeInTheDocument();
  });

  it("reuses the referencia after a network error and uses a new one for a new recharge", async () => {
    render(<App />);
    await openCard();
    answers.push("network-error");

    await recharge("20");
    expect(await screen.findByText("No se pudo conectar con el servidor. Intente de nuevo.")).toBeInTheDocument();

    answers.push({ status: 201, body: receipt(32.5) });
    await recharge("20");
    await screen.findByText("Recarga exitosa");

    answers.push({ status: 201, body: { ...receipt(52.5), idRecarga: "10", numeroComprobante: "SIM-10" } });
    await recharge("20");
    await screen.findByText("SIM-10");

    expect(call(2).body.referencia).toBe(call(1).body.referencia);
    expect(call(3).body.referencia).not.toBe(call(1).body.referencia);
  });

  // Verifier probe: a pending referencia never crosses to another card.
  it("uses a new referencia for another card after a network error", async () => {
    render(<App />);
    await openCard();
    answers.push("network-error");
    await recharge("20");
    await screen.findByText("No se pudo conectar con el servidor. Intente de nuevo.");

    fireEvent.click(screen.getByRole("button", { name: "Consultar otra tarjeta" }));
    await openCard();
    answers.push({ status: 201, body: receipt(32.5) });
    await recharge("20");
    await screen.findByText("Recarga exitosa");

    expect(call(3).body.referencia).not.toBe(call(1).body.referencia);
  });

  it("explains that recharges are not available when the route answers 404", async () => {
    render(<App />);
    await openCard();
    answers.push({ status: 404, body: { message: "Not Found" } });

    await recharge("20");

    expect(await screen.findByText("Las recargas no están disponibles.")).toBeInTheDocument();
  });

  it("shows the API message on a rejected recharge", async () => {
    render(<App />);
    await openCard();
    answers.push({ status: 409, body: { message: "La tarjeta está BLOQUEADA y no puede recargarse." } });

    await recharge("20");

    expect(await screen.findByText("La tarjeta está BLOQUEADA y no puede recargarse.")).toBeInTheDocument();
  });

  it.each(["0.99", "500.01", "10.005", "abc", ""])("rejects the amount %p without a request", async (amount) => {
    render(<App />);
    await openCard();

    await recharge(amount);

    expect(screen.getByText("Ingrese un monto entre Q1.00 y Q500.00 con hasta 2 decimales.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("QPayPro recharge (qpaypro-checkout S9)", () => {
  const CHECKOUT = { referencia: "QPP-1234", checkoutUrl: "https://sandboxpayments.qpaypro.com/checkout/woocommerce?token=abc" };
  const payButton = () => screen.getByRole("button", { name: "Pagar con QPayPro" });
  const typeEmail = (email: string) => fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: email } });

  async function openPayment(navigate = vi.fn()) {
    render(<App navigate={navigate} />);
    await openCard();
    return navigate;
  }

  it("shows the four amounts, one selected at a time", async () => {
    await openPayment();

    for (const name of ["Q10", "Q25", "Q50", "Q100"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    fireEvent.click(screen.getByRole("button", { name: "Q25" }));
    expect(screen.getByRole("button", { name: "Q25" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Q100" }));
    expect(screen.getByRole("button", { name: "Q100" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Q25" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps 'Pagar con QPayPro' disabled until an amount and a valid email are chosen", async () => {
    await openPayment();

    expect(payButton()).toBeDisabled();
    typeEmail("ana@example.com");
    expect(payButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Q50" }));
    expect(payButton()).toBeEnabled();
    for (const invalid of ["ana", "ana@", "ana@example", "a b@example.com", `${"a".repeat(95)}@x.com`, ""]) {
      typeEmail(invalid);
      expect(payButton()).toBeDisabled();
    }
    fireEvent.click(payButton());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts amount and email, then sends the browser to checkoutUrl", async () => {
    const navigate = await openPayment();
    answers.push({ status: 201, body: CHECKOUT });

    fireEvent.click(screen.getByRole("button", { name: "Q25" }));
    typeEmail("  ana@example.com ");
    fireEvent.click(payButton());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(CHECKOUT.checkoutUrl));
    expect(navigate).toHaveBeenCalledTimes(1);
    const sent = call(1);
    expect(sent).toMatchObject({ url: `${API}/citizen/cards/TEST-0001/payments`, method: "POST" });
    expect(sent.headers.get("Content-Type")).toBe("application/json");
    expect(sent.body).toEqual({ monto: 25, email: "ana@example.com" });
  });

  it("disables the button while sending", async () => {
    const navigate = await openPayment();
    let release: (r: Response) => void = () => {};
    answers.push(new Promise<never>((resolve) => (release = resolve as never)));

    fireEvent.click(screen.getByRole("button", { name: "Q10" }));
    typeEmail("ana@example.com");
    fireEvent.click(payButton());

    expect(payButton()).toBeDisabled();
    await act(async () => release(json(201, CHECKOUT)));
    expect(navigate).toHaveBeenCalledWith(CHECKOUT.checkoutUrl);
  });

  it.each([
    [400, "email must be an email"],
    [404, "La tarjeta no existe."],
    [409, "La tarjeta está BLOQUEADA y no puede recargarse."],
    [502, "No se pudo iniciar el pago con QPayPro."],
    [503, "Los pagos con QPayPro no están disponibles."],
  ])("shows the API message on %i and stays on the page", async (status, message) => {
    const navigate = await openPayment();
    answers.push({ status, body: { message } });

    fireEvent.click(screen.getByRole("button", { name: "Q10" }));
    typeEmail("ana@example.com");
    fireEvent.click(payButton());

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(payButton()).toBeEnabled();
  });

  it("shows the connection message on a network error", async () => {
    const navigate = await openPayment();
    answers.push("network-error");

    fireEvent.click(screen.getByRole("button", { name: "Q10" }));
    typeEmail("ana@example.com");
    fireEvent.click(payButton());

    expect(await screen.findByText("No se pudo conectar con el servidor.")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("hides the simulated recharge without the flag", async () => {
    await openPayment();

    expect(screen.queryByLabelText("Monto a recargar (Q)")).not.toBeInTheDocument();
    expect(screen.queryByText(/recarga simulada/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
  });

  it("offers both recharges with the flag", async () => {
    vi.stubEnv("VITE_RECHARGE_SIMULATOR", "true");
    await openPayment();

    expect(payButton()).toBeInTheDocument();
    expect(screen.getByLabelText("Monto a recargar (Q)")).toBeInTheDocument();
  });
});

describe("QPayPro result (qpaypro-checkout S10)", () => {
  const payment = (overrides: Record<string, unknown> = {}) => ({
    referencia: "QPP-1234",
    numeroTarjeta: "TEST-0001",
    monto: 25,
    estadoPago: "APROBADA",
    numeroComprobante: "QPP-REC-77",
    saldo: 37.5,
    ...overrides,
  });

  function returnFrom(referencia: string) {
    window.history.replaceState(null, "", `/?pago=${referencia}`);
    render(<App />);
  }

  it("asks the API for the payment and shows an approved recharge", async () => {
    answers.push({ status: 200, body: payment() });
    returnFrom("QPP-1234");

    expect(await screen.findByText("Recarga exitosa")).toBeInTheDocument();
    expect(call(0)).toMatchObject({ url: `${API}/citizen/payments/QPP-1234`, method: "GET" });
    expect(screen.getByText("QPP-REC-77")).toBeInTheDocument();
    expect(screen.getByText("Monto: Q25.00")).toBeInTheDocument();
    expect(screen.getByText("Nuevo saldo: Q37.50")).toBeInTheDocument();
    expect(screen.queryByLabelText("Número de tarjeta")).not.toBeInTheDocument();
  });

  it.each([
    ["RECHAZADA", "El pago fue rechazado."],
    ["EXPIRADA", "Pago cancelado o expirado."],
    ["ERROR", "No se pudo completar el pago."],
  ])("shows %s as %s", async (estadoPago, message) => {
    answers.push({ status: 200, body: payment({ estadoPago, numeroComprobante: null, saldo: 12.5 }) });
    returnFrom("QPP-1234");

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("Recarga exitosa")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verificar de nuevo" })).not.toBeInTheDocument();
  });

  it("shows a pending payment and checks it again with 'Verificar de nuevo'", async () => {
    answers.push({ status: 200, body: payment({ estadoPago: "INICIADA", numeroComprobante: null, saldo: 12.5 }) });
    returnFrom("QPP-1234");

    expect(await screen.findByText("Estamos confirmando tu pago...")).toBeInTheDocument();
    answers.push({ status: 200, body: payment() });
    fireEvent.click(screen.getByRole("button", { name: "Verificar de nuevo" }));

    expect(await screen.findByText("Recarga exitosa")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(call(1)).toMatchObject({ url: `${API}/citizen/payments/QPP-1234`, method: "GET" });
    expect(screen.queryByText("Estamos confirmando tu pago...")).not.toBeInTheDocument();
  });

  it("disables 'Verificar de nuevo' while checking", async () => {
    answers.push({ status: 200, body: payment({ estadoPago: "INICIADA", numeroComprobante: null }) });
    returnFrom("QPP-1234");
    await screen.findByText("Estamos confirmando tu pago...");
    let release: (r: Response) => void = () => {};
    answers.push(new Promise<never>((resolve) => (release = resolve as never)));

    fireEvent.click(screen.getByRole("button", { name: "Verificar de nuevo" }));

    expect(screen.getByRole("button", { name: "Verificar de nuevo" })).toBeDisabled();
    await act(async () => release(json(200, payment({ estadoPago: "RECHAZADA", numeroComprobante: null }))));
    expect(await screen.findByText("El pago fue rechazado.")).toBeInTheDocument();
  });

  it("shows 'No encontramos el pago.' for ?pago=desconocido without asking the API", async () => {
    returnFrom("desconocido");

    expect(await screen.findByText("No encontramos el pago.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows 'No encontramos el pago.' when the API answers 404", async () => {
    answers.push({ status: 404, body: { message: "El pago no existe." } });
    returnFrom("QPP-nope");

    expect(await screen.findByText("No encontramos el pago.")).toBeInTheDocument();
  });

  it("shows the connection message and lets the user retry on a network error", async () => {
    answers.push("network-error");
    returnFrom("QPP-1234");

    expect(await screen.findByText("No se pudo conectar con el servidor.")).toBeInTheDocument();
    answers.push({ status: 200, body: payment() });
    fireEvent.click(screen.getByRole("button", { name: "Verificar de nuevo" }));
    expect(await screen.findByText("Recarga exitosa")).toBeInTheDocument();
  });

  it("clears the query string and returns to the card lookup with 'Volver'", async () => {
    answers.push({ status: 200, body: payment() });
    returnFrom("QPP-1234");
    await screen.findByText("Recarga exitosa");

    fireEvent.click(screen.getByRole("button", { name: "Volver" }));

    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/");
    expect(screen.getByLabelText("Número de tarjeta")).toBeInTheDocument();
    expect(screen.queryByText("Recarga exitosa")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the card lookup without ?pago and does not ask for a payment", () => {
    render(<App />);

    expect(screen.getByLabelText("Número de tarjeta")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("turnstile simulator (S10)", () => {
  // parada-ridership S9: active lines with their paradas in route order; a
  // parada can be on two lines; the last group holds paradas without line.
  const LINES = [
    {
      idLinea: "6",
      numeroLinea: "6",
      nombreLinea: "Norte - Centro",
      paradas: [
        { idParada: "5", nombreParada: "Parada Norte", orden: 1, esEstacion: false },
        { idParada: "3", nombreParada: "Parada Centro", orden: 2, esEstacion: true },
      ],
    },
    {
      idLinea: "12",
      numeroLinea: "12",
      nombreLinea: "Centro - Sur",
      paradas: [{ idParada: "3", nombreParada: "Parada Centro", orden: 1, esEstacion: true }],
    },
    {
      idLinea: null,
      numeroLinea: null,
      nombreLinea: "Sin línea",
      paradas: [{ idParada: "9", nombreParada: "Parada Aislada", orden: null, esEstacion: false }],
    },
  ];
  const passResult = (overrides: Record<string, unknown> = {}) => ({
    idEvento: "77",
    tipo: "ENTRADA",
    numeroTarjeta: "TEST-0001",
    montoCobrado: 1,
    saldo: 11.5,
    parada: {
      idParada: "5",
      nombreParada: "Parada Norte",
      idEstacion: null,
      capacidadPasajeros: 4,
      personasEnParada: 3,
      porcentaje: 75,
      alertaActiva: false,
    },
    alertaGenerada: false,
    idAlerta: null,
    repetido: false,
    ...overrides,
  });

  async function openSimulator() {
    vi.stubEnv("VITE_TURNSTILE_SIMULATOR", "true");
    render(<App />);
    answers.push({ status: 200, body: CARD });
    answers.push({ status: 200, body: LINES });
    fireEvent.change(screen.getByLabelText("Número de tarjeta"), { target: { value: "TEST-0001" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    await screen.findByRole("option", { name: "Parada Norte" });
    fireEvent.change(screen.getByLabelText("Parada"), { target: { value: "5" } });
  }

  it("lists every parada grouped by line, marks stations and repeats shared paradas (parada-ridership S10)", async () => {
    await openSimulator();

    expect(call(1).url).toBe(`${API}/citizen/lines`);
    const groups = screen.getAllByRole("group").map((group) => ({
      label: group.getAttribute("label"),
      options: [...group.querySelectorAll("option")].map((option) => [option.value, option.textContent]),
    }));
    expect(groups).toEqual([
      {
        label: "Línea 6 - Norte - Centro",
        options: [
          ["5", "Parada Norte"],
          ["3", "Parada Centro (estación)"],
        ],
      },
      { label: "Línea 12 - Centro - Sur", options: [["3", "Parada Centro (estación)"]] },
      { label: "Sin línea", options: [["9", "Parada Aislada"]] },
    ]);
  });

  it("is not rendered when the flag is off", async () => {
    render(<App />);
    await openCard();

    expect(screen.queryByText("Simulador de talanquera")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the pass with the key header and a fresh idempotencyKey per click", async () => {
    await openSimulator();
    answers.push({ status: 201, body: passResult() });
    answers.push({ status: 201, body: passResult({ tipo: "SALIDA", montoCobrado: 0 }) });

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByText("Personas en la parada: 3");
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    await screen.findByText("Cobro: Q0.00");

    const entry = call(2);
    expect(entry).toMatchObject({ url: `${API}/operations/ridership/turnstile`, method: "POST" });
    expect(entry.headers.get("X-Turnstile-Key")).toBe("dev-key-123");
    expect(entry.body).toEqual({ numeroTarjeta: "TEST-0001", idParada: 5, tipo: "ENTRADA", idempotencyKey: expect.any(String) });
    expect(entry.body.idempotencyKey).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(call(3).body).toMatchObject({ tipo: "SALIDA", idParada: 5 });
    expect(call(3).body.idempotencyKey).not.toBe(entry.body.idempotencyKey);
    expect(Object.keys(entry.body)).not.toContain("saldo");
  });

  it("shows the charge and updates the balance of the card", async () => {
    await openSimulator();
    answers.push({ status: 201, body: passResult() });

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Cobro: Q1.00")).toBeInTheDocument();
    expect(screen.getByText("Q11.50")).toBeInTheDocument();
    expect(screen.queryByText("Q12.50")).not.toBeInTheDocument();
  });

  // S7/S10: retrying the same pass after a network error must not charge twice.
  it("reuses the idempotencyKey when the same pass is retried after a network error", async () => {
    await openSimulator();
    answers.push("network-error");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("No se pudo conectar con el servidor.")).toBeInTheDocument();

    answers.push({ status: 201, body: passResult() });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByText("Cobro: Q1.00");

    expect(call(3).body.idempotencyKey).toBe(call(2).body.idempotencyKey);
  });

  it("uses a new idempotencyKey when a different pass follows a network error", async () => {
    await openSimulator();
    answers.push("network-error");
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByText("No se pudo conectar con el servidor.");

    answers.push({ status: 201, body: passResult({ tipo: "SALIDA", montoCobrado: 0 }) });
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    await screen.findByText("Cobro: Q0.00");

    expect(call(3).body.idempotencyKey).not.toBe(call(2).body.idempotencyKey);
  });

  it("announces a capacity alert", async () => {
    await openSimulator();
    answers.push({ status: 201, body: passResult({ alertaGenerada: true, idAlerta: "4" }) });

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Se generó una alerta de capacidad")).toBeInTheDocument();
  });

  it("disables both buttons while sending and shows API errors", async () => {
    await openSimulator();
    let release: (r: Response) => void = () => {};
    answers.push(new Promise<never>((resolve) => (release = resolve as never)));

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salir" })).toBeDisabled();
    await act(async () => release(json(409, { message: "Saldo insuficiente" })));
    expect(await screen.findByText("Saldo insuficiente")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled());
  });
});

describe("demo credentials panel", () => {
  const panel = () => screen.getByRole("complementary", { name: "Datos de prueba" });

  it("lists the sample Transmetro cards and the QPayPro sandbox test card on the card lookup", () => {
    render(<App />);
    const aside = panel();
    expect(aside).toHaveTextContent("Este es un proyecto académico: use solo estos datos de ejemplo, nunca una tarjeta real.");
    expect(aside).toHaveTextContent("TEST-RID-0001");
    expect(aside).toHaveTextContent("TEST-RID-POOR");
    expect(aside).toHaveTextContent("TEST-RID-BLOCKED");
    expect(aside).toHaveTextContent("4111 1111 1111 1111");
    expect(aside).toHaveTextContent("Cualquier fecha futura, por ejemplo 01/30");
    expect(aside).toHaveTextContent("Cualquiera de 3 dígitos, por ejemplo 123");
    expect(aside).toHaveTextContent("prueba@ejemplo.com");
  });

  it("never shows QPayPro merchant credentials", () => {
    render(<App />);
    expect(panel()).not.toHaveTextContent(/visanetgt|88888888888|99999999999/);
  });

  it("stays visible on the card screen", async () => {
    render(<App />);
    await openCard();
    expect(panel()).toBeInTheDocument();
  });

  it("stays visible on a payment result", () => {
    window.history.replaceState(null, "", "/?pago=desconocido");
    render(<App />);
    expect(panel()).toBeInTheDocument();
  });

  describe("copy buttons", () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      writeText = vi.fn(async () => undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    });

    it.each([
      ["Copiar TEST-RID-0001", "TEST-RID-0001"],
      ["Copiar TEST-RID-POOR", "TEST-RID-POOR"],
      ["Copiar TEST-RID-BLOCKED", "TEST-RID-BLOCKED"],
      ["Copiar número de tarjeta QPayPro", "4111111111111111"],
      ["Copiar vencimiento", "01/30"],
      ["Copiar CVV", "123"],
      ["Copiar correo", "prueba@ejemplo.com"],
    ])("%s copies %s", async (label, value) => {
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(value));
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    it("shows Copiado on the pressed button only", async () => {
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Copiar CVV" }));
      expect(await screen.findByText("Copiado")).toBeInTheDocument();
      expect(screen.getAllByText("Copiado")).toHaveLength(1);
    });

    it("shows No se pudo copiar when the clipboard is unavailable", async () => {
      writeText.mockRejectedValueOnce(new Error("denied"));
      render(<App />);
      fireEvent.click(screen.getByRole("button", { name: "Copiar correo" }));
      expect(await screen.findByText("No se pudo copiar")).toBeInTheDocument();
    });
  });
});
