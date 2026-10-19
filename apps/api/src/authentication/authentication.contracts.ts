// Contratos de dominio para autenticación administrativa con Google
// Define los tipos de entrada/salida y errores tipados que usa el service.
// No contiene lógica de negocio, solo formas de datos y errores de dominio.

export interface LoginInput {
  // Credencial bruta (ID token de Google) que el cliente envía al endpoint /login
  credential: string;
}

// Real person behind an impersonated demo session (demo role switch).
export interface DemoActor {
  employeeId: string;
  email: string;
}

export interface LoginResult {
  // JWT token (12h expiry)
  token: string;
  // Momento exacto de expiración: ahora + 12 horas
  expiresAt: Date;
  // Datos del usuario para el frontend
  usuario: {
    employeeId: string;
    email: string;
    roles: string[];
    permissions: string[];
    scope: { role: string; modules: string[] };
    demoActor?: DemoActor;
  };
}

export interface MeResult {
  // Contexto mínimo que el frontend necesita tras autenticarse
  employeeId: string;
  email: string;
  roles: string[];       // nombres de roles activos
  permissions: string[]; // códigos de permisos (accion_permiso) del rol activo
  // Scope define los módulos accesibles según el rol del empleado
  scope: {
    role: string;
    modules: string[];
  };
  // Present only while an allowlisted reviewer impersonates a demo persona.
  demoActor?: DemoActor;
}

export interface DemoPersona {
  roleCode: string;
  roleName: string;
  employeeId: string;
  employeeName: string;
}

export interface DemoPersonasResult {
  actorEmail: string;
  impersonating: boolean;
  activeEmployeeId: string;
  personas: DemoPersona[];
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

export class DemoRoleSwitchDisabled extends Error {
  constructor() {
    super("Demo role switch is disabled.");
    this.name = "DemoRoleSwitchDisabled";
  }
}

export class DemoRoleSwitchForbidden extends Error {
  constructor() {
    super("Demo role switch is not allowed for this account.");
    this.name = "DemoRoleSwitchForbidden";
  }
}

export class DemoPersonaNotFound extends Error {
  constructor() {
    super("No eligible demo persona for this role.");
    this.name = "DemoPersonaNotFound";
  }
}

export class SessionConflict extends Error {
  constructor() {
    super("Conflicto de sesión.");
    this.name = "SessionConflict";
  }
}