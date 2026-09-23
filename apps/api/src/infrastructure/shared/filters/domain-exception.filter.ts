import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

// Errores de dominio tipados que el filtro intercepta
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

// Filtro que mapea errores de dominio a respuestas HTTP
@Catch(NotFoundError, ConflictError, ValidationError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(
    exception: NotFoundError | ConflictError | ValidationError,
    host: ArgumentsHost,
  ): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status: number;

    switch (exception.constructor) {
      case NotFoundError:
        status = HttpStatus.NOT_FOUND;
        break;
      case ConflictError:
        status = HttpStatus.CONFLICT;
        break;
      case ValidationError:
        status = HttpStatus.BAD_REQUEST;
        break;
      default:
        status = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    response.status(status).json({
      statusCode: status,
      message: exception.message,
      error: exception.name,
    });
  }
}
