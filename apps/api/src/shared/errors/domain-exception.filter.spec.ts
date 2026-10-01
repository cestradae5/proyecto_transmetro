// Regression test for the legacy infra filter's constructor-equality bug
// (verified in design.md Decision 2): DomainExceptionFilter here MUST use
// instanceof chains so named subclasses (UnitNotFound, DuplicatePlate, etc.)
// resolve to the correct HTTP status instead of falling through to 500.

import { jest } from "@jest/globals";
import { HttpStatus } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import type { Response } from "express";

import {
  ConflictError,
  DomainExceptionFilter,
  NotFoundError,
  ValidationError,
} from "./domain-exception.filter.js";
import {
  DomainExceptionFilter as LegacyDomainExceptionFilter,
  NotFoundError as LegacyNotFoundError,
} from "../../infrastructure/shared/filters/domain-exception.filter.js";

function makeHost(): { host: ArgumentsHost; response: Response } {
  const response = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe("DomainExceptionFilter (shared, instanceof dispatch)", () => {
  it("maps a subclassed NotFoundError to 404 via instanceof, not exact constructor equality", () => {
    class UnitNotFound extends NotFoundError {
      constructor(id: string) {
        super(`Unidad con ID ${id} no existe.`);
        this.name = "UnitNotFound";
      }
    }
    const filter = new DomainExceptionFilter();
    const { host, response } = makeHost();

    filter.catch(new UnitNotFound("1"), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(response.json).toHaveBeenCalledWith({
      error: "UnitNotFound",
      message: "Unidad con ID 1 no existe.",
      statusCode: HttpStatus.NOT_FOUND,
    });
  });

  it("maps a subclassed ConflictError to 409 via instanceof, not exact constructor equality", () => {
    class DuplicatePlate extends ConflictError {
      constructor(placa: string) {
        super(`El número de placa ${placa} ya está registrado.`);
        this.name = "DuplicatePlate";
      }
    }
    const filter = new DomainExceptionFilter();
    const { host, response } = makeHost();

    filter.catch(new DuplicatePlate("AB-12345"), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith({
      error: "DuplicatePlate",
      message: "El número de placa AB-12345 ya está registrado.",
      statusCode: HttpStatus.CONFLICT,
    });
  });

  it("maps a subclassed ValidationError to 400 via instanceof, not exact constructor equality", () => {
    class InvalidCapacity extends ValidationError {
      constructor() {
        super("La capacidad debe ser mayor a cero.");
        this.name = "InvalidCapacity";
      }
    }
    const filter = new DomainExceptionFilter();
    const { host, response } = makeHost();

    filter.catch(new InvalidCapacity(), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({
      error: "InvalidCapacity",
      message: "La capacidad debe ser mayor a cero.",
      statusCode: HttpStatus.BAD_REQUEST,
    });
  });

  it("documents that the legacy infra filter's exact-constructor switch 500s on the same subclass", () => {
    class UnitNotFound extends LegacyNotFoundError {
      constructor() {
        super("Unidad no existe.");
        this.name = "UnitNotFound";
      }
    }
    const legacyFilter = new LegacyDomainExceptionFilter();
    const { host, response } = makeHost();

    legacyFilter.catch(new UnitNotFound(), host);

    // BUG (verified, design.md Decision 2): exception.constructor !== NotFoundError
    // for any subclass, so the legacy switch falls through to the default case.
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
