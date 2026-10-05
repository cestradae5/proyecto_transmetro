import { ApiError } from "../../../lib/api-client";

const GENERIC_CONNECTION = "Error de conexión. Por favor, intente de nuevo.";
const GENERIC_ERROR = "Ocurrió un error inesperado. Por favor, intente de nuevo.";

/** Extracts the backend `message` (Nest default body) as a string, if any. */
function backendMessage(err: ApiError): string | undefined {
  const message = err.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const parts = message.filter((m): m is string => typeof m === "string");
    if (parts.length > 0) return parts.join(". ");
  }
  return undefined;
}

/** Resolves a user-facing Spanish message for a personal API error, by HTTP status. */
export function getPersonalErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return GENERIC_CONNECTION;

  switch (err.status) {
    case 400:
      return (
        backendMessage(err) ??
        "Los datos enviados no son válidos. Revise el formulario."
      );
    case 401:
    case 403:
      return "No tiene permiso para realizar esta acción o su sesión expiró.";
    case 404:
      return "El empleado no existe o fue eliminado.";
    case 409:
      return (
        backendMessage(err) ??
        "La operación genera un conflicto con datos existentes."
      );
    default:
      return GENERIC_ERROR;
  }
}

/** Translates a personal API error and rethrows it as a plain Error. */
export function mapPersonalError(err: unknown): never {
  throw new Error(getPersonalErrorMessage(err));
}
