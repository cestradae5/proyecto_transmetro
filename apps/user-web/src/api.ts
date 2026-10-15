// Client for the public citizen endpoints and the turnstile simulator
// (odd/tasks/user-web.md S3-S7). No login: the card number is the identity.

export interface Card {
  numeroTarjeta: string;
  saldo: number;
  estadoTarjeta: string;
}

export interface Station {
  idEstacion: string;
  nombreEstacion: string;
}

export interface Recharge {
  idRecarga: string;
  numeroComprobante: string;
  monto: number;
  saldo: number;
  fechaRecarga: string;
  repetida: boolean;
}

export type TurnstileType = "ENTRADA" | "SALIDA";

export interface TurnstilePass {
  idEvento: string;
  tipo: TurnstileType;
  montoCobrado: number;
  saldo: number;
  estacion: { nombreEstacion: string; personasEnEstacion: number; capacidadPasajeros: number };
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

export const listStations = () => request<Station[]>("/citizen/stations");

export const rechargeCard = (numeroTarjeta: string, monto: number, referencia: string) =>
  request<Recharge>(`${cardPath(numeroTarjeta)}/recharges`, jsonPost({ monto, referencia }));

// The balance is never sent: the API reads and charges it.
export const passTurnstile = (
  numeroTarjeta: string,
  idEstacion: number,
  tipo: TurnstileType,
  idempotencyKey: string,
) =>
  request<TurnstilePass>(
    "/operations/ridership/turnstile",
    jsonPost(
      { numeroTarjeta, idEstacion, tipo, idempotencyKey },
      { "X-Turnstile-Key": import.meta.env.VITE_TURNSTILE_API_KEY ?? "" },
    ),
  );

export const formatMoney = (amount: number) => `Q${amount.toFixed(2)}`;

export const NETWORK_ERROR_MESSAGE = "No se pudo conectar con el servidor.";
