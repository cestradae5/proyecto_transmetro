import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

// Errores de dominio tipados que el filtro intercepta.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Filtro que mapea errores de dominio a respuestas HTTP.
//
// Corrige el bug verificado del filtro original de infrastructure/shared/:
// el switch usaba `exception.constructor`, que solo coincide con la clase
// exacta y no con subclases (p. ej. UnitNotFound extends NotFoundError).
// Aquí se usa `instanceof` en cadena, para que cualquier subclase nombrada
// resuelva al status HTTP correcto.
@Catch(NotFoundError, ConflictError, ValidationError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(
    exception: NotFoundError | ConflictError | ValidationError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;

    if (exception instanceof NotFoundError) {
      status = HttpStatus.NOT_FOUND;
    } else if (exception instanceof ConflictError) {
      status = HttpStatus.CONFLICT;
    } else if (exception instanceof ValidationError) {
      status = HttpStatus.BAD_REQUEST;
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    response.status(status).json({
      statusCode: status,
      message: exception.message,
      error: exception.name,
    });
  }
}
