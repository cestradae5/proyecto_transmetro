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
// PERMISSION_TO_MODULE — maps DB permission codes to the 8 canonical dashboard
// modules (spec Requirement 2) plus the ambient `self_profile` card.
// Keys MUST match MODULE_LABELS in landing-page.tsx or the card won't render
// (guarded by the completeness assertion in role-module-matrix.spec.ts).
// `ROLES_PERMISOS_ADMINISTRAR` is intentionally NOT mapped: it is an
// admin-only capability (role/permission administration), not a dashboard
// card (design Open Question Q2).
// ────────────────────────────────────────────────────────────────────────────
export const PERMISSION_TO_MODULE: Record<string, string> = {
  INFRAESTRUCTURA_GESTIONAR: "infrastructure",

  FLOTA_GESTIONAR: "fleet",
  FLOTA_ESTACION_SOLICITAR: "fleet",
  FLOTA_ESTACION_CONSULTAR: "fleet",
  UNIDAD_ASIGNADA_CONSULTAR: "fleet",

  EMPLEADOS_PERFILES_ADMINISTRAR: "personnel",

  ALERTAS_OPERATIVAS_GESTIONAR: "operational_alerts",
  ALERTAS_ESTACION_GESTIONAR: "operational_alerts",
  ALERTAS_UNIDAD_GESTIONAR: "operational_alerts",
  METRICAS_UNIDAD_REPORTAR: "operational_alerts",

  PANEL_OPERATIVO_CENTRAL_USAR: "central_operations_panel",

  REPORTES_ADMINISTRATIVOS_CONSULTAR: "administrative_reports",

  AUDITORIA_BITACORA_CONSULTAR: "audit_log",

  RECARGAS_REPORTES_CONSULTAR: "recharge_reporting",

  // Ambient card: every authenticated employee gets it, regardless of role.
  // Excluded from the 8-module RBAC matrix (design Decision 3).
  PERFIL_PROPIO_CONSULTAR: "self_profile",
};

// Stable render order for dashboard cards, independent of permission-row order.
const MODULE_ORDER = [
  "infrastructure",
  "fleet",
  "personnel",
  "operational_alerts",
  "central_operations_panel",
  "administrative_reports",
  "audit_log",
  "recharge_reporting",
  "self_profile",
];

/**
 * Derives frontend modules from a list of permission codes.
 * Returns a stable-ordered, deduplicated array of module keys.
 */
export function deriveModulesFromPermissions(permissions: string[]): string[] {
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

  // Verifica JWT y retorna payload decodificado.
  //
  // Decision 2 (design.md): `scope.modules` is recomputed from the stable
  // `permissions` array on every call, instead of trusting the module list
  // baked into the JWT at login(). JWTs live 12h; without recomputation, a
  // PERMISSION_TO_MODULE rename (like this 6→8 module expansion) would only
  // reach a user after their token expires and they re-login. Recomputing
  // here makes it apply immediately on the next `/authentication/me` call.
  //
  // Residual limitation: this self-heals module-*naming* drift only. If a
  // permission itself is revoked mid-session, `payload.permissions` is still
  // the stale value from login — that only clears on token expiry (12h).
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
        scope: {
          role: payload.scope.role,
          modules: deriveModulesFromPermissions(payload.permissions),
        },
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