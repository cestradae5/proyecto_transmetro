// Contratos de dominio para autenticación administrativa con Google
// Define los tipos de entrada/salida y errores tipados que usa el service.
// No contiene lógica de negocio, solo formas de datos y errores de dominio.

export interface LoginInput {
  // Credencial bruta (ID token de Google) que el cliente envía al endpoint /login
  credential: string;
}

export interface LoginResult {
  // Hash SHA-256 del token de sesión (lo que se guarda en BD y se devuelve al cliente en cookie)
  sessionHash: string;
  // Momento exacto de expiración fija: ahora + 12 horas (sin renovación deslizante)
  expiresAt: Date;
}

export interface MeResult {
  // Contexto mínimo que el frontend necesita tras autenticarse
  employeeId: string;
  email: string;
  roles: string[];       // nombres de roles activos
  permissions: string[]; // códigos de permisos (accion_permiso) del rol activo
}

export interface LogoutResult {
  // true = sesión revocada (idempotente: si ya no existía, también true)
  revoked: boolean;
}

export interface AuditEntry {
  // Forma del registro de auditoría que se persiste en tbl_bitacora
  id: string;
  action: string;        // "LOGIN" | "LOGOUT"
  employeeId: string;
  entityId: string;      // session hash o id de sesión
  entityType: string;    // "session"
  module: string;        // "authentication"
  result: string;        // "EXITOSO" | "FALLIDO"
  createdAt: Date;
}

// Errores de dominio tipados — el service lanza estos, el controller los mapea a HTTP
// Todos usan el mismo mensaje genérico para no filtrar información

export class InvalidCredentials extends Error {
  constructor() {
    super("Credenciales inválidas.");
    this.name = "InvalidCredentials";
  }
}

export class EmployeeNotEligible extends Error {
  constructor() {
    super("Empleado no elegible.");
    this.name = "EmployeeNotEligible";
  }
}

export class SessionConflict extends Error {
  constructor() {
    super("Conflicto de sesión.");
    this.name = "SessionConflict";
  }
}