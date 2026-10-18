import { readQpayproEnv, redactSecrets } from "./qpaypro.config.js";

// Nest token of the QPayPro client; e2e tests override it with a fake so
// automated runs never reach the sandbox.
export const QPAYPRO_CLIENT = Symbol("QPAYPRO_CLIENT");

export const REGISTER_TIMEOUT_MS = 15_000;

// S7: by QPayPro's transaction id when known, else by the x_fp_sequence sent
// at registration (fpSequenceFor, L10).
export type QpayproTransactionQuery = { idTrans: string } | { fpSequence: string };

// One transaction of get_transaction_detail (L7), ids and codes as strings.
export interface QpayproTransaction {
  idTransaction: string;
  status: string;
  amount: string;
  authorizationNumber: string | null;
  responseCode: string | null;
  // As QPayPro sends it, e.g. "2021-07-28T20:13:06.000000Z"; S7 checks it.
  dateTransaction: string | null;
}

export type QpayproTransactionDetail = { found: true; transactions: QpayproTransaction[] } | { found: false };

export interface QpayproClient {
  // Registers a hosted-checkout transaction and returns its token.
  // Throws QpayproClientError on any failure.
  registerTransaction(fields: Record<string, string>): Promise<{ token: string }>;
  // Asks QPayPro about a transaction; "not found" is an answer, anything
  // else unexpected throws QpayproClientError.
  getTransactionDetail(query: QpayproTransactionQuery): Promise<QpayproTransactionDetail>;
}

// The message never contains a credential: it is stored in
// tbl_transaccion_pago.mensaje_respuesta.
export class QpayproClientError extends Error {
  constructor(message: string) {
    super(redactSecrets(message));
    this.name = "QpayproClientError";
  }
}

interface QpayproBody {
  estado?: unknown;
  data?: { token?: unknown };
  message?: unknown;
  result?: unknown;
  response?: unknown;
}

const UNEXPECTED_DETAIL = "QPayPro answered an unexpected transaction detail";

// qpaypro-checkout S3 (L2, L5): multipart POST to register_transaction_store,
// answer { estado: "success", data: { token } }. S7 (L7): multipart POST to
// get_transaction_detail, answer { result: 1, response: [tx] } or
// { result: 0, responseText }.
export class HttpQpayproClient implements QpayproClient {
  constructor(private readonly timeoutMs = REGISTER_TIMEOUT_MS) {}

  async registerTransaction(fields: Record<string, string>): Promise<{ token: string }> {
    const body = await this.post("/checkout/register_transaction_store", fields);
    const token = body?.data?.token;
    if (body?.estado !== "success" || typeof token !== "string" || token === "") {
      throw new QpayproClientError(messageOf(body) ?? "QPayPro answered without a token");
    }
    return { token };
  }

  async getTransactionDetail(query: QpayproTransactionQuery): Promise<QpayproTransactionDetail> {
    const env = readQpayproEnv();
    if (!env.login || !env.privateKey || !env.apiSecret) {
      throw new QpayproClientError("QPayPro query credentials are not configured");
    }
    const body = await this.post("/checkout/get_transaction_detail", {
      x_login: env.login,
      x_private_key: env.privateKey,
      x_api_secret: env.apiSecret,
      ...("idTrans" in query ? { idTrans: query.idTrans } : { x_fp_sequence: query.fpSequence }),
    });
    if (body?.result === 0) return { found: false };
    if (body?.result !== 1 || !Array.isArray(body.response) || body.response.length === 0) {
      throw new QpayproClientError(UNEXPECTED_DETAIL);
    }
    const transactions = body.response.map(toTransaction);
    if (transactions.some((tx) => tx === undefined)) throw new QpayproClientError(UNEXPECTED_DETAIL);
    return { found: true, transactions: transactions as QpayproTransaction[] };
  }

  // A 200 answer's JSON body (undefined when it is not JSON); throws on a
  // network error, a timeout or another HTTP status.
  private async post(path: string, fields: Record<string, string>): Promise<QpayproBody | undefined> {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);

    let response: Response;
    try {
      response = await fetch(`${readQpayproEnv().baseUrl}${path}`, {
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
    if (response.status !== 200) {
      const message = messageOf(body);
      throw new QpayproClientError(`QPayPro answered HTTP ${response.status}${message ? `: ${message}` : ""}`);
    }
    return body;
  }
}

async function readJson(response: Response): Promise<QpayproBody | undefined> {
  try {
    const body = (await response.json()) as unknown;
    return body !== null && typeof body === "object" ? (body as QpayproBody) : undefined;
  } catch {
    return undefined;
  }
}

// QPayPro answers message as a string or as a list of strings.
function messageOf(body: QpayproBody | undefined): string | undefined {
  const raw = body?.message;
  const text = Array.isArray(raw) ? raw.filter((item) => typeof item === "string").join("; ") : raw;
  return typeof text === "string" && text !== "" ? text : undefined;
}

// QPayPro sends ids and codes as numbers or strings (L7).
const scalar = (value: unknown): string | null =>
  (typeof value === "string" && value !== "") || (typeof value === "number" && Number.isFinite(value))
    ? String(value)
    : null;

function toTransaction(raw: unknown): QpayproTransaction | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const tx = raw as Record<string, unknown>;
  const idTransaction = scalar(tx.idTransaction);
  const amount = scalar(tx.amount);
  if (!idTransaction || typeof tx.status !== "string" || tx.status === "" || !amount || !Number.isFinite(Number(amount))) {
    return undefined;
  }
  return {
    idTransaction,
    status: tx.status,
    amount,
    authorizationNumber: scalar(tx.authorizationNumber),
    responseCode: scalar(tx.responseCode),
    dateTransaction: typeof tx.dateTransaction === "string" && tx.dateTransaction !== "" ? tx.dateTransaction : null,
  };
}
