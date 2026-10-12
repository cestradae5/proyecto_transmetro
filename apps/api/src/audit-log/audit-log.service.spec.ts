import { jest } from "@jest/globals";
import type { DataSource } from "typeorm";

import { AuditLogService } from "./audit-log.service.js";
import type { QueryAuditLogDto } from "./dto/query-audit-log.dto.js";

type QueryMock = jest.Mock<(sql: string, params?: unknown[]) => Promise<unknown[]>>;

function makeService(responses: unknown[][]): { service: AuditLogService; query: QueryMock } {
  const query: QueryMock = jest.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  const service = new AuditLogService({ query } as unknown as DataSource);
  return { service, query };
}

const row = {
  id: "10",
  createdAt: new Date("2026-02-01T10:00:00.000Z"),
  module: "fleet",
  action: "assign_pilot",
  entityType: "unidad",
  entityId: "7",
  result: "EXITOSO",
  detalle: { idUnidad: 7 },
  employeeId: "2",
  employeeName: "Ana Perez",
  employeeEmail: "ana@transmetro.gt",
};

const query = (overrides: Partial<QueryAuditLogDto> = {}): QueryAuditLogDto =>
  ({ page: 1, pageSize: 20, ...overrides }) as QueryAuditLogDto;

describe("AuditLogService.findAll", () => {
  it("returns mapped items, total and pagination, newest first, with no filters", async () => {
    const { service, query: q } = makeService([[{ total: "1" }], [row]]);

    const result = await service.findAll(query());

    expect(result).toEqual({
      items: [
        {
          id: "10",
          createdAt: "2026-02-01T10:00:00.000Z",
          module: "fleet",
          action: "assign_pilot",
          entityType: "unidad",
          entityId: "7",
          result: "EXITOSO",
          detalle: { idUnidad: 7 },
          employee: { id: "2", name: "Ana Perez", email: "ana@transmetro.gt" },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const [countSql, countParams] = q.mock.calls[0]!;
    expect(countSql).toMatch(/COUNT\(\*\)/i);
    expect(countSql).not.toMatch(/WHERE/i);
    expect(countParams).toEqual([]);
    const [listSql, listParams] = q.mock.calls[1]!;
    expect(listSql).toMatch(/ORDER BY b\.fecha_hora DESC, b\.id_bitacora DESC/);
    expect(listSql).toMatch(/LIMIT \$1 OFFSET \$2/);
    expect(listParams).toEqual([20, 0]);
  });

  it("maps a null detalle to null", async () => {
    const { service } = makeService([[{ total: "1" }], [{ ...row, detalle: null }]]);
    const result = await service.findAll(query());
    expect(result.items[0]!.detalle).toBeNull();
  });

  it("binds every filter as a parameter and computes the page offset", async () => {
    const { service, query: q } = makeService([[{ total: "45" }], []]);

    const result = await service.findAll(
      query({
        from: "2026-01-01",
        to: "2026-01-31",
        user: "ana",
        module: "fleet",
        action: "assign_pilot",
        result: "FALLIDO",
        page: 3,
        pageSize: 10,
      }),
    );

    expect(result.total).toBe(45);
    expect(result.page).toBe(3);
    const [countSql, countParams] = q.mock.calls[0]!;
    expect(countSql).toContain("b.fecha_hora >= $1");
    expect(countSql).toContain("b.fecha_hora < $2");
    expect(countSql).toContain("(e.nombre_emple ILIKE $3 OR e.correo_emple ILIKE $3)");
    expect(countSql).toContain("b.modulo = $4");
    expect(countSql).toContain("b.accion = $5");
    expect(countSql).toContain("b.resultado = $6");
    expect(countSql).not.toContain("ana");
    expect(countParams).toEqual([
      "2026-01-01",
      // date-only "to" is inclusive: strictly before the next day
      "2026-02-01",
      "%ana%",
      "fleet",
      "assign_pilot",
      "FALLIDO",
    ]);
    const [, listParams] = q.mock.calls[1]!;
    expect(listParams).toEqual([...countParams!, 10, 20]);
  });

  it("uses an inclusive upper bound for a full timestamp 'to'", async () => {
    const { service, query: q } = makeService([[{ total: "0" }], []]);
    await service.findAll(query({ to: "2026-01-31T12:00:00Z" }));
    const [countSql, countParams] = q.mock.calls[0]!;
    expect(countSql).toContain("b.fecha_hora <= $1");
    expect(countParams).toEqual(["2026-01-31T12:00:00Z"]);
  });

  it("escapes LIKE wildcards in the user filter", async () => {
    const { service, query: q } = makeService([[{ total: "0" }], []]);
    await service.findAll(query({ user: "50%_a\\b" }));
    expect(q.mock.calls[0]![1]).toEqual(["%50\\%\\_a\\\\b%"]);
  });

  it("skips the list query when the count is zero", async () => {
    const { service, query: q } = makeService([[{ total: "0" }]]);
    const result = await service.findAll(query());
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(q).toHaveBeenCalledTimes(1);
  });
});

describe("AuditLogService.getOptions", () => {
  it("returns distinct sorted modules and actions", async () => {
    const { service, query: q } = makeService([
      [{ value: "authentication" }, { value: "fleet" }],
      [{ value: "LOGIN" }, { value: "assign_pilot" }],
    ]);

    expect(await service.getOptions()).toEqual({
      modules: ["authentication", "fleet"],
      actions: ["LOGIN", "assign_pilot"],
    });
    expect(q.mock.calls[0]![0]).toMatch(/SELECT DISTINCT modulo AS value FROM tbl_bitacora ORDER BY modulo/);
    expect(q.mock.calls[1]![0]).toMatch(/SELECT DISTINCT accion AS value FROM tbl_bitacora ORDER BY accion/);
  });
});
