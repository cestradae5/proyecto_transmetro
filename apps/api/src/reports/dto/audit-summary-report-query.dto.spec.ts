import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { AuditSummaryReportQueryDto } from "./audit-summary-report-query.dto.js";

async function errorsOf(input: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(AuditSummaryReportQueryDto, input));
  return errors.map((e) => e.property).sort();
}

describe("AuditSummaryReportQueryDto", () => {
  it("accepts a date-only range", async () => {
    expect(await errorsOf({ from: "2026-01-01", to: "2026-01-31" })).toEqual([]);
  });

  it("requires both bounds", async () => {
    expect(await errorsOf({})).toEqual(["from", "to"]);
  });

  it.each(["2026-13-01", "01/02/2026", "2026-01-01T00:00:00Z", "hoy"])("rejects %s", async (value) => {
    expect(await errorsOf({ from: value, to: "2026-01-31" })).toEqual(["from"]);
  });
});
