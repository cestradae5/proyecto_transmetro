import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { QueryAuditLogDto } from "./query-audit-log.dto.js";

async function failedProperties(payload: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(QueryAuditLogDto, payload));
  return errors.map((error) => error.property);
}

describe("QueryAuditLogDto", () => {
  it("accepts an empty query and applies pagination defaults", async () => {
    expect(await failedProperties({})).toEqual([]);
    const dto = plainToInstance(QueryAuditLogDto, {});
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it("accepts every filter and converts numeric query strings", async () => {
    const payload = {
      from: "2026-01-01",
      to: "2026-01-31T23:00:00Z",
      user: "  ana ",
      module: "fleet",
      action: "assign_pilot",
      result: "EXITOSO",
      page: "3",
      pageSize: "50",
    };
    expect(await failedProperties(payload)).toEqual([]);
    const dto = plainToInstance(QueryAuditLogDto, payload);
    expect(dto.user).toBe("ana");
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(50);
  });

  it("rejects an unknown result", async () => {
    expect(await failedProperties({ result: "OK" })).toEqual(["result"]);
  });

  it("rejects malformed dates", async () => {
    expect(await failedProperties({ from: "yesterday", to: "2026-13-45" })).toEqual(["from", "to"]);
  });

  it("rejects out-of-range pagination", async () => {
    expect(await failedProperties({ page: "0", pageSize: "101" })).toEqual(["page", "pageSize"]);
    expect(await failedProperties({ pageSize: "abc" })).toEqual(["pageSize"]);
  });
});
