import { computeOrderHash, verifyOrderHash } from "./qpaypro.signature.js";

// Vectors computed outside the code under test:
// printf 'QPP-abc|418203|10.00|1|88888888888' | sha256sum
const APPROVED = "c73fb70bd7e3e429df52020e59c2a4e02e078d60b736ababd51f03f0bbbc2164";
// printf 'QPP-abc|418203|10.00|2|88888888888' | sha256sum
const REJECTED = "c87f5467f40d7fc7c9cd67366fb4949d436bda6f9087472a463a9b7449c20c62";

describe("QPayPro order_hash (qpaypro-checkout S4)", () => {
  it("is sha256(order_id|x_trans_id|x_amount|x_response_status|private_key) in hex", () => {
    expect(computeOrderHash("QPP-abc", "418203", "10.00", "1", "88888888888")).toBe(APPROVED);
    expect(computeOrderHash("QPP-abc", "418203", "10.00", "2", "88888888888")).toBe(REJECTED);
  });

  it("signs the raw amount string, so 10 and 10.00 differ", () => {
    expect(computeOrderHash("QPP-abc", "418203", "10", "1", "88888888888")).not.toBe(APPROVED);
  });

  it("accepts the matching hash, also in upper case", () => {
    const params = { orderId: "QPP-abc", transId: "418203", amount: "10.00", status: "1", hash: APPROVED };

    expect(verifyOrderHash(params, "88888888888")).toBe(true);
    expect(verifyOrderHash({ ...params, hash: APPROVED.toUpperCase() }, "88888888888")).toBe(true);
  });

  it.each([
    ["another status", { status: "2" }],
    ["another amount", { amount: "25.00" }],
    ["another order", { orderId: "QPP-other" }],
    ["a truncated hash", { hash: APPROVED.slice(0, 63) }],
    ["an empty hash", { hash: "" }],
    ["a non-hex hash of the same length", { hash: "z".repeat(64) }],
  ])("rejects %s", (_label, change) => {
    const params = { orderId: "QPP-abc", transId: "418203", amount: "10.00", status: "1", hash: APPROVED, ...change };

    expect(verifyOrderHash(params, "88888888888")).toBe(false);
  });

  it("rejects a valid hash under another private key", () => {
    const params = { orderId: "QPP-abc", transId: "418203", amount: "10.00", status: "1", hash: APPROVED };

    expect(verifyOrderHash(params, "99999999999")).toBe(false);
  });
});
