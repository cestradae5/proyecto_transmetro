import { createHash, timingSafeEqual } from "node:crypto";

export interface RelaySignature {
  orderId: string;
  transId: string;
  // The raw x_amount string QPayPro signed; never reformatted.
  amount: string;
  status: string;
  hash: string;
}

// qpaypro-checkout S4: the order_hash QPayPro appends to the relay URL.
export function computeOrderHash(
  orderId: string,
  transId: string,
  amountRaw: string,
  status: string,
  privateKey: string,
): string {
  return createHash("sha256").update(`${orderId}|${transId}|${amountRaw}|${status}|${privateKey}`).digest("hex");
}

// Constant-time comparison of the received hash with the expected one.
export function verifyOrderHash(params: RelaySignature, privateKey: string): boolean {
  const expected = Buffer.from(
    computeOrderHash(params.orderId, params.transId, params.amount, params.status, privateKey),
    "utf8",
  );
  const received = Buffer.from(params.hash.toLowerCase(), "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
