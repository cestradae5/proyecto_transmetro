import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";
import { StreamableFile, UnauthorizedException } from "@nestjs/common";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../shared/errors/domain-exception.filter.js";
import { ReportsController } from "./reports.controller.js";
import type { ReportsService } from "./reports.service.js";

describe("ReportsController", () => {
  let exportFn: jest.Mock<(...args: any[]) => Promise<{ fileName: string; content: Buffer }>>;
  let controller: ReportsController;
  let setHeader: jest.Mock<(...args: any[]) => void>;
  const request = { user: { employeeId: "7" } } as never;

  beforeEach(() => {
    exportFn = jest.fn(async () => ({ fileName: "reporte-flota-2026-01-15.pdf", content: Buffer.from("%PDF-x") }));
    controller = new ReportsController({ export: exportFn } as unknown as ReportsService);
    setHeader = jest.fn();
  });

  const response = () => ({ setHeader }) as never;

  it.each([
    ["fleet", () => controller.fleet(request, response())],
    ["personnel", () => controller.personnel(request, response())],
    ["infrastructure", () => controller.infrastructure(request, response())],
  ] as const)("%s() streams the PDF as an attachment for the actor", async (type, call) => {
    const file = await call();

    expect(file).toBeInstanceOf(StreamableFile);
    expect(exportFn).toHaveBeenCalledWith(type, { employeeId: "7" });
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="reporte-flota-2026-01-15.pdf"',
    );
  });

  it("auditLog() passes the range", async () => {
    await controller.auditLog({ from: "2026-01-01", to: "2026-01-31" }, request, response());
    expect(exportFn).toHaveBeenCalledWith("audit-log", { employeeId: "7" }, { from: "2026-01-01", to: "2026-01-31" });
  });

  it("alerts() passes the range (alerts S5)", async () => {
    await controller.alerts({ from: "2026-01-01", to: "2026-01-31" }, request, response());
    expect(exportFn).toHaveBeenCalledWith("alerts", { employeeId: "7" }, { from: "2026-01-01", to: "2026-01-31" });
  });

  it("rejects a request without an authenticated user", async () => {
    await expect(controller.fleet({} as never, response())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(exportFn).not.toHaveBeenCalled();
  });

  it("is guarded, filtered and mounted at reports with the permission of each report (S5)", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toContain(AuthenticationGuard);
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, ReportsController)).toContain(DomainExceptionFilter);
    expect(Reflect.getMetadata("path", ReportsController)).toBe("reports");
    const proto = ReportsController.prototype as unknown as Record<string, () => void>;
    for (const name of ["fleet", "personnel", "infrastructure", "alerts"]) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name]!)).toEqual(["REPORTES_ADMINISTRATIVOS_CONSULTAR"]);
    }
    expect(Reflect.getMetadata(PERMISSIONS_KEY, proto.auditLog!)).toEqual(["AUDITORIA_BITACORA_CONSULTAR"]);
  });

  it("exposes only the five report handlers", () => {
    const handlers = Object.getOwnPropertyNames(ReportsController.prototype).filter(
      (name) => name !== "constructor" && name !== "send" && name !== "actorOf",
    );
    expect(handlers.sort()).toEqual(["alerts", "auditLog", "fleet", "infrastructure", "personnel"]);
  });
});
