import { fpSequenceFor } from "./qpaypro.fp-sequence.js";

describe("fpSequenceFor (qpaypro-checkout S3, L10)", () => {
  const REFERENCIAS = Array.from(
    { length: 200 },
    (_, i) => `QPP-${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
  );

  it("is a 10-digit decimal string whose first digit is 1-9", () => {
    for (const referencia of REFERENCIAS) expect(fpSequenceFor(referencia)).toMatch(/^[1-9]\d{9}$/);
  });

  it("answers the same value for the same referencia", () => {
    const referencia = "QPP-123e4567-e89b-42d3-a456-426614174000";

    expect(fpSequenceFor(referencia)).toBe(fpSequenceFor(referencia));
  });

  it("answers different values for different referencias", () => {
    expect(new Set(REFERENCIAS.map(fpSequenceFor)).size).toBe(REFERENCIAS.length);
  });

  // Computed outside this code: int(sha256(ref).hexdigest()[:16], 16) % 9000000000 + 1000000000.
  it.each([
    ["QPP-00000000-0000-4000-8000-000000000000", "4010911029"],
    ["QPP-123e4567-e89b-42d3-a456-426614174000", "3600173123"],
  ])("maps %s to %s", (referencia, expected) => {
    expect(fpSequenceFor(referencia)).toBe(expected);
  });
});
