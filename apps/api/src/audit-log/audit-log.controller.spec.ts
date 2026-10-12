import { jest } from "@jest/globals";
import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA } from "@nestjs/common/constants";

import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PERMISSIONS_KEY } from "../authentication/permissions.decorator.js";
import { DomainExceptionFilter } from "../shared/errors/domain-exception.filter.js";
import { AuditLogController } from "./audit-log.controller.js";
import type { AuditLogService } from "./audit-log.service.js";
import type { QueryAuditLogDto } from "./dto/query-audit-log.dto.js";

describe("AuditLogController", () => {
  let service: {
    findAll: jest.Mock<(...args: any[]) => any>;
    getOptions: jest.Mock<(...args: any[]) => any>;
  };
  let controller: AuditLogController;

  beforeEach(() => {
    service = { findAll: jest.fn(), getOptions: jest.fn() };
    controller = new AuditLogController(service as unknown as AuditLogService);
  });

  it("findAll() delegates the query", async () => {
    const page = { items: [], total: 0, page: 1, pageSize: 20 };
    service.findAll.mockResolvedValue(page);
    const query = { page: 1, pageSize: 20, module: "fleet" } as QueryAuditLogDto;

    expect(await controller.findAll(query)).toBe(page);
    expect(service.findAll).toHaveBeenCalledWith(query);
  });

  it("getOptions() delegates", async () => {
    const options = { modules: ["fleet"], actions: ["LOGIN"] };
    service.getOptions.mockResolvedValue(options);
    expect(await controller.getOptions()).toBe(options);
  });

  it("is guarded, filtered, mounted at audit-log and every handler requires AUDITORIA_BITACORA_CONSULTAR", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AuditLogController)).toContain(AuthenticationGuard);
    expect(Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, AuditLogController)).toContain(
      DomainExceptionFilter,
    );
    expect(Reflect.getMetadata("path", AuditLogController)).toBe("audit-log");
    const proto = AuditLogController.prototype as unknown as Record<string, () => void>;
    for (const name of ["findAll", "getOptions"]) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[name]!)).toEqual(["AUDITORIA_BITACORA_CONSULTAR"]);
    }
  });

  it("exposes only read handlers (the log is not editable)", () => {
    const handlers = Object.getOwnPropertyNames(AuditLogController.prototype).filter(
      (name) => name !== "constructor",
    );
    expect(handlers.sort()).toEqual(["findAll", "getOptions"]);
  });
});
