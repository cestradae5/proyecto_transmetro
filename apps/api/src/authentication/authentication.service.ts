// Servicio de autenticación: valida credenciales Google y genera JWT stateless.
// Reglas de negocio puras — sin HTTP, cookies, CORS, ni wiring de Nest.
// Inyecta repositorios y verifier Google vía puertos (inversión de dependencias).

import { Inject } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { DataSource, type EntityManager } from "typeorm";

import { EmployeeEntity, EMPLOYEE_STATUSES } from "./entities/employee.entity.js";
import { AuditLogEntity, AUDIT_RESULTS } from "./entities/audit-log.entity.js";
import { EmployeeRepository } from "./infrastructure/employee.repository.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";
import { GOOGLE_CREDENTIAL_VERIFIER, DATASOURCE, type GoogleCredentialVerifier } from "./infrastructure/google-credential-verifier.port.js";
import { InvalidCredentials, EmployeeNotEligible, LoginInput, LoginResult, MeResult, LogoutResult } from "./authentication.contracts.js";

// ────────────────────────────────────────────────────────────────────────────
// PERMISSION_TO_MODULE — maps DB permission codes to frontend module keys.
// Keys MUST match MODULE_LABELS in landing-page.tsx or the card won't render.
// ────────────────────────────────────────────────────────────────────────────
export const PERMISSION_TO_MODULE: Record<string, string> = {
  // GIS / infrastructure
  INFRAESTRUCTURA_GESTIONAR: "gis",
  PANEL_OPERATIVO_CENTRAL_USAR: "gis",

  // Fleet management
  FLOTA_GESTIONAR: "fleet",
  FLOTA_ESTACION_SOLICITAR: "fleet",
  UNIDAD_ASIGNADA_CONSULTAR: "fleet",

  // Alerts (operational awareness → report)
  ALERTAS_OPERATIVAS_GESTIONAR: "report",
  ALERTAS_ESTACION_GESTIONAR: "report",
  ALERTAS_UNIDAD_GESTIONAR: "report",
  METRICAS_UNIDAD_REPORTAR: "report",

  // Reports
  REPORTES_ADMINISTRATIVOS_CONSULTAR: "report",

  // Audit
  AUDITORIA_BITACORA_CONSULTAR: "audit",

  // Recharge
  RECARGAS_REPORTES_CONSULTAR: "recharge",

  // Self-profile (every authenticated user)
  PERFIL_PROPIO_CONSULTAR: "self_profile",
};

/**
 * Derives frontend modules from a list of permission codes.
 * Returns a stable-ordered, deduplicated array of module keys.
 */
export function deriveModulesFromPermissions(permissions: string[]): string[] {
  const MODULE_ORDER = ["fleet", "gis", "audit", "report", "recharge", "self_profile"];
  const modules = new Set<string>();
  for (const perm of permissions) {
    const mod = PERMISSION_TO_MODULE[perm];
    if (mod) modules.add(mod);
  }
  return MODULE_ORDER.filter((m) => modules.has(m));
}

// Configuración JWT
const JWT_EXPIRY = "12h"; // expiración del token JWT
const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production"; // IMPORTANTE: cambiar en producción

export class AuthenticationService {
  constructor(
    @Inject(DATASOURCE)
    private readonly dataSource: DataSource,           // para transacciones TypeORM
    private readonly employeeRepo: EmployeeRepository, // busca empleado elegible
    private readonly auditRepo: AuditRepository,       // registra LOGIN
    @Inject(GOOGLE_CREDENTIAL_VERIFIER)
    private readonly googleVerifier: GoogleCredentialVerifier, // valida ID token Google
  ) {}

  // Login JWT stateless:
  // 1. Verifica credencial Google → email normalizado
  // 2. Busca empleado ACTIVO con ROL ACTIVO
  // 3. Genera JWT (12h) con payload: { employeeId, email, roles, permissions, scope }
  // 4. Audita LOGIN
  // 5. Devuelve JWT + datos del usuario
  async login(credential: string): Promise<LoginResult> {
    const { email } = await this.googleVerifier.verify(credential);
    const normalizedEmail = email.trim().toUpperCase(); // case-insensitive lookup

    return this.dataSource.transaction(async (manager: EntityManager) => {
      // Busca empleado ACTIVO con ROL ACTIVO
      const employee = await this.employeeRepo.findEligibleByEmail(manager, normalizedEmail);
      if (!employee) {
        // Auditoría de intento fallido
        await this.auditRepo.create(manager, {
          action: "LOGIN",
          employee: { id: "unknown" } as EmployeeEntity,
          entityId: "jwt-login",
          entityType: "jwt",
          module: "authentication",
          result: AUDIT_RESULTS.FAILURE,
        });
        throw new InvalidCredentials(); // mensaje genérico
      }

      const roleName = employee.role?.name ?? "NONE";
      const permissions = employee.role?.permissions?.map((p) => p.code) ?? [];
      const modules = deriveModulesFromPermissions(permissions);

      // Genera JWT con payload completo
      const token = jwt.sign(
        {
          employeeId: employee.id,
          email: employee.email,
          roles: [roleName],
          permissions,
          scope: { role: roleName, modules },
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      // Auditoría de éxito
      await this.auditRepo.create(manager, {
        action: "LOGIN",
        employee,
        entityId: employee.id,
        entityType: "jwt",
        module: "authentication",
        result: AUDIT_RESULTS.SUCCESS,
      });

      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h

      return {
        token,
        expiresAt,
        usuario: {
          employeeId: employee.id,
          email: employee.email,
          roles: [roleName],
          permissions,
          scope: { role: roleName, modules },
        },
      };
    });
  }

  // Verifica JWT y retorna payload decodificado
  async verifyToken(token: string): Promise<MeResult> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as {
        employeeId: string;
        email: string;
        roles: string[];
        permissions: string[];
        scope: { role: string; modules: string[] };
      };
      
      return {
        employeeId: payload.employeeId,
        email: payload.email,
        roles: payload.roles,
        permissions: payload.permissions,
        scope: payload.scope,
      };
    } catch {
      throw new InvalidCredentials();
    }
  }

  // Logout stateless: el token sigue siendo válido hasta expirar,
  // pero el cliente lo borra del localStorage
  async logout(): Promise<LogoutResult> {
    // Stateless: no hay sesión que revocar server-side
    // El frontend borra el token del localStorage
    return { revoked: true };
  }
}