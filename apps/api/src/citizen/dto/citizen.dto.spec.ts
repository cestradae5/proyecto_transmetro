import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreatePaymentDto, CreateRechargeDto } from "./citizen.dto.js";

// Same options as the global ValidationPipe in main.ts.
async function errorsOf<T extends object>(type: new () => T, body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(type, body), { whitelist: true });
  return errors.map((error) => error.property);
}

describe("CreatePaymentDto (qpaypro-checkout S3)", () => {
  it.each([10, 25, 50, 100])("accepts monto %s", async (monto) => {
    expect(await errorsOf(CreatePaymentDto, { monto, email: "ana@example.com" })).toEqual([]);
  });

  it.each([
    ["9", 9],
    ["10.5", 10.5],
    ['the string "10"', "10"],
    ["0", 0],
    ["200", 200],
    ["no amount", undefined],
  ])("rejects monto %s", async (_label, monto) => {
    expect(await errorsOf(CreatePaymentDto, { monto, email: "ana@example.com" })).toEqual(["monto"]);
  });

  it.each([
    ["not an email", "ana"],
    ["no domain", "ana@"],
    ["a number", 5],
    ["missing", undefined],
    ["over 100 chars", `ana@${"a".repeat(60)}.${"b".repeat(32)}.com`],
  ])("rejects an email that is %s", async (_label, email) => {
    expect(await errorsOf(CreatePaymentDto, { monto: 10, email })).toEqual(["email"]);
  });

  it("accepts an email of exactly 100 chars", async () => {
    const email = `ana@${"a".repeat(60)}.${"b".repeat(31)}.com`;

    expect(email).toHaveLength(100);
    expect(await errorsOf(CreatePaymentDto, { monto: 10, email })).toEqual([]);
  });
});

describe("CreateRechargeDto referencia (qpaypro-checkout S8)", () => {
  it("rejects a referencia reserved for QPayPro", async () => {
    expect(await errorsOf(CreateRechargeDto, { monto: 10, referencia: "QPP-12345678" })).toEqual(["referencia"]);
  });

  it.each(["abc12345-sim", "qpp-12345678", "XQPP-1234567"])("still accepts %s", async (referencia) => {
    expect(await errorsOf(CreateRechargeDto, { monto: 10, referencia })).toEqual([]);
  });
});
