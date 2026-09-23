// Contratos de dominio para el módulo de infraestructura
// Define interfaces de respuestas de error tipadas y formas de datos comunes

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
}

export interface ValidationErrorResponse extends ErrorResponse {
  statusCode: 400;
  error: "ValidationError";
}

export interface NotFoundErrorResponse extends ErrorResponse {
  statusCode: 404;
  error: "NotFoundError";
}

export interface ConflictErrorResponse extends ErrorResponse {
  statusCode: 409;
  error: "ConflictError";
}
