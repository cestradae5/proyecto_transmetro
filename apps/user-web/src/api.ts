// Client for the public citizen endpoints and the turnstile simulator
// (odd/tasks/user-web.md S3-S7). No login: the card number is the identity.

export interface Card {
  numeroTarjeta: string;
  saldo: number;
  estadoTarjeta: string;
}

export interface LineStop {
  idParada: string;
  nombreParada: string;
  orden: number | null;
  esEstacion: boolean;
}

/** An active line with its paradas in route order; idLinea null = "Sin línea". */
export interface Line {
  idLinea: string | null;
  numeroLinea: string | null;
  nombreLinea: string;
  paradas: LineStop[];
}

export interface Recharge {
  idRecarga: string;
  numeroComprobante: string;
  monto: number;
  saldo: number;
  fechaRecarga: string;
  repetida: boolean;
}

/** QPayPro hosted checkout (odd/tasks/qpaypro-checkout.md S3). */
export interface PaymentCheckout {
  referencia: string;
  checkoutUrl: string;
}

export type PaymentState = "INICIADA" | "APROBADA" | "RECHAZADA" | "ERROR" | "EXPIRADA";

/** Payment status (qpaypro-checkout S6); `saldo` is the current card balance. */
export interface Payment {
  referencia: string;
  numeroTarjeta: string;
  monto: number;
  estadoPago: PaymentState;
  numeroComprobante: string | null;
  saldo: number;
}

export type TurnstileType = "ENTRADA" | "SALIDA";

export interface TurnstilePass {
  idEvento: string;
  tipo: TurnstileType;
  montoCobrado: number;
  saldo: number;
  parada: { nombreParada: string; personasEnParada: number; capacidadPasajeros: number };
  alertaGenerada: boolean;
  repetido: boolean;
}

/** The API answered with an error status; `message` comes from its body. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The request never reached the API (offline, CORS, server down). */
export class NetworkError extends Error {
  constructor() {
    super("network error");
    this.name = "NetworkError";
  }
}

const apiBaseUrl = () => import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, init);
  } catch {
    throw new NetworkError();
  }
  const body = (await response.json().catch(() => ({}))) as { message?: unknown };
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    throw new ApiError(response.status, typeof message === "string" ? message : response.statusText);
  }
  return body as T;
}

const jsonPost = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const cardPath = (numeroTarjeta: string) => `/citizen/cards/${encodeURIComponent(numeroTarjeta)}`;

export const getCard = (numeroTarjeta: string) => request<Card>(cardPath(numeroTarjeta));

export const listLines = () => request<Line[]>("/citizen/lines");

export const rechargeCard = (numeroTarjeta: string, monto: number, referencia: string) =>
  request<Recharge>(`${cardPath(numeroTarjeta)}/recharges`, jsonPost({ monto, referencia }));

export const startPayment = (numeroTarjeta: string, monto: number, email: string) =>
  request<PaymentCheckout>(`${cardPath(numeroTarjeta)}/payments`, jsonPost({ monto, email }));

export const getPayment = (referencia: string) =>
  request<Payment>(`/citizen/payments/${encodeURIComponent(referencia)}`);

// The balance is never sent: the API reads and charges it.
export const passTurnstile = (
  numeroTarjeta: string,
  idParada: number,
  tipo: TurnstileType,
  idempotencyKey: string,
) =>
  request<TurnstilePass>(
    "/operations/ridership/turnstile",
    jsonPost(
      { numeroTarjeta, idParada, tipo, idempotencyKey },
      { "X-Turnstile-Key": import.meta.env.VITE_TURNSTILE_API_KEY ?? "" },
    ),
  );

export const formatMoney = (amount: number) => `Q${amount.toFixed(2)}`;

export const NETWORK_ERROR_MESSAGE = "No se pudo conectar con el servidor.";
