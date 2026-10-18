import { readQpayproEnv, redactSecrets } from "./qpaypro.config.js";

// Nest token of the QPayPro client; e2e tests override it with a fake so
// automated runs never reach the sandbox.
export const QPAYPRO_CLIENT = Symbol("QPAYPRO_CLIENT");

export const REGISTER_TIMEOUT_MS = 15_000;

export interface QpayproClient {
  // Registers a hosted-checkout transaction and returns its token.
  // Throws QpayproClientError on any failure.
  registerTransaction(fields: Record<string, string>): Promise<{ token: string }>;
}

// The message never contains a credential: it is stored in
// tbl_transaccion_pago.mensaje_respuesta.
export class QpayproClientError extends Error {
  constructor(message: string) {
    super(redactSecrets(message));
    this.name = "QpayproClientError";
  }
}

interface RegisterBody {
  estado?: unknown;
  data?: { token?: unknown };
  message?: unknown;
}

// qpaypro-checkout S3 (L2, L5): multipart POST to register_transaction_store,
// answer { estado: "success", data: { token } }.
export class HttpQpayproClient implements QpayproClient {
  constructor(private readonly timeoutMs = REGISTER_TIMEOUT_MS) {}

  async registerTransaction(fields: Record<string, string>): Promise<{ token: string }> {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);

    let response: Response;
    try {
      response = await fetch(`${readQpayproEnv().baseUrl}/checkout/register_transaction_store`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // The abort reason is a DOMException, which is not always an Error
      // instance across realms: check its name.
      const name = (error as { name?: unknown } | null)?.name;
      if (name === "TimeoutError") {
        throw new QpayproClientError(`QPayPro did not answer within ${this.timeoutMs / 1000} s`);
      }
      const message = (error as { message?: unknown } | null)?.message;
      throw new QpayproClientError(`QPayPro request failed: ${typeof message === "string" ? message : String(error)}`);
    }

    const body = await readJson(response);
    const message = messageOf(body);
    if (response.status !== 200) {
      throw new QpayproClientError(`QPayPro answered HTTP ${response.status}${message ? `: ${message}` : ""}`);
    }
    const token = body?.data?.token;
    if (body?.estado !== "success" || typeof token !== "string" || token === "") {
      throw new QpayproClientError(message ?? "QPayPro answered without a token");
    }
    return { token };
  }
}

async function readJson(response: Response): Promise<RegisterBody | undefined> {
  try {
    const body = (await response.json()) as unknown;
    return body !== null && typeof body === "object" ? (body as RegisterBody) : undefined;
  } catch {
    return undefined;
  }
}

// QPayPro answers message as a string or as a list of strings.
function messageOf(body: RegisterBody | undefined): string | undefined {
  const raw = body?.message;
  const text = Array.isArray(raw) ? raw.filter((item) => typeof item === "string").join("; ") : raw;
  return typeof text === "string" && text !== "" ? text : undefined;
}
