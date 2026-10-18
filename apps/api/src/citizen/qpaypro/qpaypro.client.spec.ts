import { jest } from "@jest/globals";

import { HttpQpayproClient, QpayproClientError } from "./qpaypro.client.js";

type FetchMock = jest.Mock<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>;

const SECRETS = {
  QPAYPRO_LOGIN: "login-value-1",
  QPAYPRO_API_KEY: "api-key-value-2",
  QPAYPRO_PRIVATE_KEY: "private-key-value-3",
  QPAYPRO_API_SECRET: "api-secret-value-4",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("HttpQpayproClient.registerTransaction (qpaypro-checkout S3)", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    Object.assign(process.env, SECRETS, { QPAYPRO_BASE_URL: "https://qpp.example/" });
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const register = (timeoutMs?: number) =>
    new HttpQpayproClient(timeoutMs).registerTransaction({ x_invoice_num: "QPP-1", x_amount: "10.00" });

  async function failure(timeoutMs?: number): Promise<QpayproClientError> {
    const error = await register(timeoutMs).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(QpayproClientError);
    return error as QpayproClientError;
  }

  it("POSTs every field as multipart/form-data to register_transaction_store and returns the token", async () => {
    fetchMock.mockResolvedValue(json({ estado: "success", data: { token: "tok-123" } }));

    await expect(register()).resolves.toEqual({ token: "tok-123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://qpp.example/checkout/register_transaction_store");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init!.body as FormData;
    expect(Object.fromEntries(body.entries())).toEqual({ x_invoice_num: "QPP-1", x_amount: "10.00" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses the sandbox when QPAYPRO_BASE_URL is unset", async () => {
    delete process.env.QPAYPRO_BASE_URL;
    fetchMock.mockResolvedValue(json({ estado: "success", data: { token: "tok" } }));

    await register();

    expect(fetchMock.mock.calls[0]![0]).toBe("https://sandboxpayments.qpaypro.com/checkout/register_transaction_store");
  });

  it("maps a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect((await failure()).message).toBe("QPayPro request failed: fetch failed");
  });

  it("maps a timeout", async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
        }),
    );

    expect((await failure(20)).message).toBe("QPayPro did not answer within 0.02 s");
  });

  it("maps a non-200 answer, keeping QPayPro's message", async () => {
    fetchMock.mockResolvedValue(json({ status: "error", message: "Server error" }, 500));

    expect((await failure()).message).toBe("QPayPro answered HTTP 500: Server error");
  });

  it("maps a 200 answer without a token, joining QPayPro's messages", async () => {
    fetchMock.mockResolvedValue(
      json({ status: "error", message: ["x_login / x_api_key inactive or does not exists", "x_city is required"] }),
    );

    expect((await failure()).message).toBe(
      "x_login / x_api_key inactive or does not exists; x_city is required",
    );
  });

  it.each([
    ["an empty token", { estado: "success", data: { token: "" } }],
    ["no data", { estado: "success" }],
    ["a failed estado", { estado: "error", data: { token: "tok" } }],
  ])("maps a success-shaped body with %s", async (_label, body) => {
    fetchMock.mockResolvedValue(json(body));

    expect((await failure()).message).toBe("QPayPro answered without a token");
  });

  it("maps a body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 200 }));

    expect((await failure()).message).toBe("QPayPro answered without a token");
  });

  it("never puts a credential in the error message", async () => {
    fetchMock.mockResolvedValue(
      json({ message: `bad ${SECRETS.QPAYPRO_LOGIN} ${SECRETS.QPAYPRO_API_KEY} ${SECRETS.QPAYPRO_PRIVATE_KEY} ${SECRETS.QPAYPRO_API_SECRET}` }),
    );

    const message = (await failure()).message;

    expect(message).toBe("bad *** *** *** ***");
  });
});

describe("HttpQpayproClient.getTransactionDetail (qpaypro-checkout S7, L7)", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let fetchMock: FetchMock;

  beforeEach(() => {
    Object.assign(process.env, SECRETS, { QPAYPRO_BASE_URL: "https://qpp.example" });
    fetchMock = jest.fn() as FetchMock;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const L7_TX = {
    idTransaction: 418203,
    status: "Aprobada",
    auditNumber: 1191,
    authorizationNumber: "831000",
    currency: "GTQ",
    amount: "1.00",
    responseCode: 100,
    responseText: "Transacción exitosa",
    dateTransaction: "2021-07-28T20:13:06.000000Z",
  };

  async function failure(query: Parameters<HttpQpayproClient["getTransactionDetail"]>[0], timeoutMs?: number) {
    const error = await new HttpQpayproClient(timeoutMs).getTransactionDetail(query).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(QpayproClientError);
    return error as QpayproClientError;
  }

  it("POSTs the query credentials and idTrans as multipart to get_transaction_detail and returns the transactions", async () => {
    fetchMock.mockResolvedValue(json({ result: 1, response: [L7_TX] }));

    await expect(new HttpQpayproClient().getTransactionDetail({ idTrans: "418203" })).resolves.toEqual({
      found: true,
      transactions: [
        {
          idTransaction: "418203",
          status: "Aprobada",
          amount: "1.00",
          authorizationNumber: "831000",
          responseCode: "100",
          dateTransaction: "2021-07-28T20:13:06.000000Z",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://qpp.example/checkout/get_transaction_detail");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    expect(Object.fromEntries((init!.body as FormData).entries())).toEqual({
      x_login: SECRETS.QPAYPRO_LOGIN,
      x_private_key: SECRETS.QPAYPRO_PRIVATE_KEY,
      x_api_secret: SECRETS.QPAYPRO_API_SECRET,
      idTrans: "418203",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("queries by x_fp_sequence", async () => {
    fetchMock.mockResolvedValue(
      json({ result: 1, response: [{ ...L7_TX, authorizationNumber: null, responseCode: "05", dateTransaction: undefined }] }),
    );

    await expect(new HttpQpayproClient().getTransactionDetail({ fpSequence: "77" })).resolves.toEqual({
      found: true,
      transactions: [
        { idTransaction: "418203", status: "Aprobada", amount: "1.00", authorizationNumber: null, responseCode: "05", dateTransaction: null },
      ],
    });

    expect(Object.fromEntries((fetchMock.mock.calls[0]![1]!.body as FormData).entries())).toEqual({
      x_login: SECRETS.QPAYPRO_LOGIN,
      x_private_key: SECRETS.QPAYPRO_PRIVATE_KEY,
      x_api_secret: SECRETS.QPAYPRO_API_SECRET,
      x_fp_sequence: "77",
    });
  });

  it("answers not found for result 0", async () => {
    fetchMock.mockResolvedValue(json({ result: 0, responseText: "Transacción no encontrada" }));

    await expect(new HttpQpayproClient().getTransactionDetail({ fpSequence: "77" })).resolves.toEqual({ found: false });
  });

  it.each([
    ["no result", { response: [L7_TX] }],
    ["an empty response list", { result: 1, response: [] }],
    ["a response that is not a list", { result: 1, response: L7_TX }],
    ["a transaction without status", { result: 1, response: [{ ...L7_TX, status: undefined }] }],
    ["a transaction without id", { result: 1, response: [{ ...L7_TX, idTransaction: undefined }] }],
    ["a transaction with a bad amount", { result: 1, response: [{ ...L7_TX, amount: "abc" }] }],
    ["a result of 2", { result: 2 }],
  ])("maps a malformed body with %s", async (_label, body) => {
    fetchMock.mockResolvedValue(json(body));

    expect((await failure({ idTrans: "1" })).message).toBe("QPayPro answered an unexpected transaction detail");
  });

  it("maps a body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>500</html>", { status: 200 }));

    expect((await failure({ idTrans: "1" })).message).toBe("QPayPro answered an unexpected transaction detail");
  });

  it("maps a non-200 answer", async () => {
    fetchMock.mockResolvedValue(json({ message: "Server error" }, 500));

    expect((await failure({ idTrans: "1" })).message).toBe("QPayPro answered HTTP 500: Server error");
  });

  it("maps a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    expect((await failure({ idTrans: "1" })).message).toBe("QPayPro request failed: fetch failed");
  });

  it("maps a timeout", async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
        }),
    );

    expect((await failure({ idTrans: "1" }, 20)).message).toBe("QPayPro did not answer within 0.02 s");
  });

  it("fails without calling QPayPro when a query credential is missing", async () => {
    delete process.env.QPAYPRO_API_SECRET;

    expect((await failure({ idTrans: "1" })).message).toBe("QPayPro query credentials are not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never puts a credential in the error message", async () => {
    fetchMock.mockResolvedValue(json({ message: `bad ${SECRETS.QPAYPRO_PRIVATE_KEY} ${SECRETS.QPAYPRO_API_SECRET}` }, 401));

    expect((await failure({ idTrans: "1" })).message).toBe("QPayPro answered HTTP 401: bad *** ***");
  });
});
