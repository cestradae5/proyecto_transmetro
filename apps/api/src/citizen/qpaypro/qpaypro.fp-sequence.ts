import { createHash } from "node:crypto";

const FP_SEQUENCE_MIN = 1_000_000_000n;
const FP_SEQUENCE_SPAN = 9_000_000_000n;

// qpaypro-checkout S3, L10: the x_fp_sequence of a payment. The sandbox login
// is shared, so a small row id could match another merchant's transaction;
// this is a 10-digit number (first digit 1-9) from the first 64 bits of
// sha256(referencia), recomputable at query time without storing it.
export function fpSequenceFor(referencia: string): string {
  const slice = BigInt(`0x${createHash("sha256").update(referencia).digest("hex").slice(0, 16)}`);
  return String((slice % FP_SEQUENCE_SPAN) + FP_SEQUENCE_MIN);
}
