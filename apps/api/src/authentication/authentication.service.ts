// Servicio de autenticación: orquesta el ciclo de vida transaccional de sesiones.
// Reglas de negocio puras — sin HTTP, cookies, CORS, ni wiring de Nest.
// Inyecta repositorios y verifier Google vía puertos (inversión de dependencias).

import { createHash, randomBytes } from "node:crypto";
import { DataSource, type EntityManager } from "typeorm";

import { EmployeeEntity, EMPLOYEE_STATUSES } from "./entities/employee.entity.js";
import { SessionEntity } from "./entities/session.entity.js";
import { AuditLogEntity, AUDIT_RESULTS } from "./entities/audit-log.entity.js";
import { EmployeeRepository } from "./infrastructure/employee.repository.js";
import { SessionRepository } from "./infrastructure/session.repository.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";
import type { GoogleCredentialVerifier } from "./infrastructure/google-credential-verifier.port.js";
import { InvalidCredentials, EmployeeNotEligible, SessionConflict, LoginInput, LoginResult, MeResult, LogoutResult } from "./authentication.contracts.js";

// Configuración inmutable del ciclo de vida de sesión
const SESSION_EXPIRY_HOURS = 12;      // expiración fija absoluta, sin sliding renewal
const SESSION_TOKEN_BYTES = 32;       // 32 bytes = 256 bits de entropía para el token crudo

// Hash SHA-256 del token crudo — lo que se guarda en BD y se envía en cookie
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Genera token criptográficamente seguro (32 bytes hex = 64 chars)
function generateRawToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("hex");
}

export class AuthenticationService {
  constructor(
    private readonly dataSource: DataSource,           // para transacciones TypeORM
    private readonly employeeRepo: EmployeeRepository, // busca empleado elegible con lock
    private readonly sessionRepo: SessionRepository,   // crea/borra/busca sesiones
    private readonly auditRepo: AuditRepository,       // registra LOGIN/LOGOUT
    private readonly googleVerifier: GoogleCredentialVerifier, // valida ID token Google
  ) {}

  // Login transaccional atómico:
  // 1. Verifica credencial Google → email normalizado
  // 2. Genera token crudo + hash SHA-256 + expiración 12h
  // 3. En UNA transacción: lock employee → borra sesiones viejas → inserta nueva → audita
  // 4. Si falla cualquier paso: rollback total, nada se persiste
  // 5. Devuelve solo hash y expiración (token crudo NUNCA sale de aquí)
  async login(credential: string): Promise<LoginResult> {
    const { email } = await this.googleVerifier.verify(credential);
    const normalizedEmail = email.trim().toUpperCase(); // case-insensitive lookup

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

    return this.dataSource.transaction(async (manager: EntityManager) => {
      // Busca empleado ACTIVO con ROL ACTIVO; lock pesimista solo sobre employee
      const employee = await this.employeeRepo.findEligibleByEmail(manager, normalizedEmail);
      if (!employee) {
        // Auditoría de intento fallido (sin filtrar por qué falló)
        await this.auditRepo.create(manager, {
          action: "LOGIN",
          employee: { id: "unknown" } as EmployeeEntity,
          entityId: tokenHash,
          entityType: "session",
          module: "authentication",
          result: AUDIT_RESULTS.FAILURE,
        });
        throw new InvalidCredentials(); // mensaje genérico
      }

      // Single-session policy: revoca cualquier sesión previa del empleado
      await this.sessionRepo.deleteByEmployeeId(manager, employee.id);

      // Inserta nueva sesión con hash SHA-256 y expiración fija
      const session = await this.sessionRepo.create(manager, {
        employee,
        expiresAt,
        tokenHash,
      });

      // Auditoría de éxito — solo campos seguros
      await this.auditRepo.create(manager, {
        action: "LOGIN",
        employee,
        entityId: session.id,
        entityType: "session",
        module: "authentication",
        result: AUDIT_RESULTS.SUCCESS,
      });

      return { sessionHash: tokenHash, expiresAt };
    });
  }

  // /me — contexto mínimo para frontend autenticado
  // Valida que la sesión exista y no haya expirado
  async me(sessionHash: string): Promise<MeResult> {
    const session = await this.sessionRepo.findByHash(sessionHash);
    if (!session) {
      throw new InvalidCredentials();
    }
    if (session.expiresAt < new Date()) {
      throw new InvalidCredentials();
    }

    const employee = session.employee;
    // Permisos = códigos de acción (accion_permiso) del rol activo
    const permissions = employee.role?.permissions?.map((p) => p.code) ?? [];

    return {
      employeeId: employee.id,
      email: employee.email,
      roles: [employee.role?.name].filter(Boolean) as string[],
      permissions,
    };
  }

  // Logout idempotente: si la sesión ya no existe, retorna true sin error
  // En transacción: borra sesión + audita LOGOUT
  async logout(sessionHash: string): Promise<LogoutResult> {
    const session = await this.sessionRepo.findByHash(sessionHash);
    if (!session) {
      return { revoked: true };
    }

    const employee = session.employee;

    await this.dataSource.transaction(async (manager: EntityManager) => {
      await this.sessionRepo.deleteByEmployeeId(manager, employee.id);
      await this.auditRepo.create(manager, {
        action: "LOGOUT",
        employee,
        entityId: session.id,
        entityType: "session",
        module: "authentication",
        result: AUDIT_RESULTS.SUCCESS,
      });
    });

    return { revoked: true };
  }
}