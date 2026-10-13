import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import type { DataSource, EntityManager } from "typeorm";
import { getMetadataArgsStorage } from "typeorm";

import {
  AuthenticationConfigurationError,
  IntegrationDatabaseConfigurationError,
  readAuthenticationEnvironment,
  readIntegrationDatabaseEnvironment,
} from "../platform/configuration/environment.js";
import { AuditLogEntity, AUDIT_RESULTS } from "./entities/audit-log.entity.js";
import { EmployeeEntity, EMPLOYEE_STATUSES } from "./entities/employee.entity.js";
import { PermissionEntity } from "./entities/permission.entity.js";
import { RoleEntity } from "./entities/role.entity.js";
import { SessionEntity } from "./entities/session.entity.js";
import { AuditRepository } from "./infrastructure/audit.repository.js";
import { EmployeeRepository } from "./infrastructure/employee.repository.js";
import {
  GoogleAuthLibraryAdapter,
  type GoogleIdTokenClient,
} from "./infrastructure/google-auth-library.adapter.js";
import {
  AUTHENTICATION_DENIAL_MESSAGE,
  GoogleCredentialVerificationError,
} from "./infrastructure/google-credential-verifier.port.js";
import { SessionRepository } from "./infrastructure/session.repository.js";
import { AuthenticationService } from "./authentication.service.js";

function tableName(target: Function): string | undefined {
  return getMetadataArgsStorage().tables.find((table) => table.target === target)
    ?.name;
}

function columnNames(target: Function): string[] {
  return getMetadataArgsStorage()
    .columns.filter((column) => column.target === target)
    .map((column) => column.options.name?.toString() ?? column.propertyName);
}

function relation(target: Function, propertyName: string) {
  return getMetadataArgsStorage().relations.find(
    (candidate) =>
      candidate.target === target && candidate.propertyName === propertyName,
  );
}

describe("Google authentication foundation", () => {
  it("normalizes a verified Google identity after audience verification", async () => {
    const client: GoogleIdTokenClient = {
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => ({
          email: " Admin@Transmetro.GT ",
          email_verified: true,
          name: "Admin User",
        }),
      }),
    };
    const verifier = new GoogleAuthLibraryAdapter("client-id", client);

    await expect(verifier.verify("credential")).resolves.toEqual({
      email: "admin@transmetro.gt",
      name: "Admin User",
    });
    expect(client.verifyIdToken).toHaveBeenCalledWith({
      audience: "client-id",
      idToken: "credential",
    });
  });

  it.each([
    ["an unverified email", { email: "admin@transmetro.gt", email_verified: false }],
    ["a missing email", { email_verified: true }],
  ])("uses the same generic denial for %s", async (_caseName, payload) => {
    const client: GoogleIdTokenClient = {
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => payload,
      }),
    };
    const verifier = new GoogleAuthLibraryAdapter("client-id", client);

    await expect(verifier.verify("credential")).rejects.toEqual(
      new GoogleCredentialVerificationError(),
    );
    await expect(verifier.verify("credential")).rejects.toMatchObject({
      message: AUTHENTICATION_DENIAL_MESSAGE,
      name: "GoogleCredentialVerificationError",
    });
  });

  it("uses the generic denial when Google rejects a malformed credential", async () => {
    const client: GoogleIdTokenClient = {
      verifyIdToken: jest.fn().mockRejectedValue(new Error("expired token")),
    };
    const verifier = new GoogleAuthLibraryAdapter("client-id", client);

    await expect(verifier.verify("credential")).rejects.toMatchObject({
      message: AUTHENTICATION_DENIAL_MESSAGE,
      name: "GoogleCredentialVerificationError",
    });
  });

  it("maps authentication entities to the existing RBAC, session, and audit tables", () => {
    expect(tableName(EmployeeEntity)).toBe("tbl_empleado");
    expect(tableName(RoleEntity)).toBe("tbl_rol");
    expect(tableName(PermissionEntity)).toBe("tbl_permiso");
    expect(tableName(SessionEntity)).toBe("tbl_sesion");
    expect(tableName(AuditLogEntity)).toBe("tbl_bitacora");
    expect(columnNames(RoleEntity)).toEqual(
      expect.arrayContaining([
        "id_rol",
        "nombre_rol",
        "codigo",
        "descrip_rol",
        "activo",
        "creado_en",
        "actualizado_en",
      ]),
    );
    expect(columnNames(EmployeeEntity)).toEqual(
      expect.arrayContaining([
        "id_emple",
        "nombre_emple",
        "estado_emple",
        "correo_emple",
      ]),
    );
    expect(columnNames(SessionEntity)).toEqual(
      expect.arrayContaining([
        "id_sesion",
        "token_hash",
        "fecha_creacion",
        "fecha_expiracion",
        "fecha_revocacion",
      ]),
    );
    expect(columnNames(AuditLogEntity)).toEqual(
      expect.arrayContaining([
        "id_bitacora",
        "fecha_hora",
        "modulo",
        "accion",
        "entidad_tipo",
        "entidad_id",
        "resultado",
      ]),
    );
    expect(relation(EmployeeEntity, "role")?.relationType).toBe("many-to-one");
    expect(relation(RoleEntity, "permissions")?.relationType).toBe("many-to-many");
    expect(relation(SessionEntity, "employee")?.relationType).toBe("many-to-one");
    expect(relation(AuditLogEntity, "employee")?.relationType).toBe("many-to-one");
    expect(
      getMetadataArgsStorage().joinTables.find(
        (joinTable) =>
          joinTable.target === RoleEntity && joinTable.propertyName === "permissions",
      )?.name,
    ).toBe("tbl_rol_permiso");
  });

  it("finds an eligible employee through the supplied transaction manager", async () => {
    const employee = { id: "7" } as EmployeeEntity;
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(employee),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      }),
    } as unknown as EntityManager;

    await expect(
      new EmployeeRepository().findEligibleByEmail(
        manager,
        " Admin@Transmetro.GT ",
      ),
    ).resolves.toBe(employee);
    expect(queryBuilder.setLock).toHaveBeenCalledWith(
      "pessimistic_write",
      undefined,
      ["employee"],
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      "LOWER(employee.email) = :email",
      { email: "admin@transmetro.gt" },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      "employee.status = :employeeStatus",
      { employeeStatus: "ACTIVO" },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith("role.active = :roleActive", {
      roleActive: true,
    });
  });

  it("does not manufacture eligibility when the repository query has no match", async () => {
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      }),
    } as unknown as EntityManager;

    await expect(
      new EmployeeRepository().findEligibleByEmail(manager, "inactive@transmetro.gt"),
    ).resolves.toBeNull();
    expect(queryBuilder.getOne).toHaveBeenCalledTimes(1);
  });

  it("keeps session and audit persistence inside the supplied transaction manager", async () => {
    const create = jest.fn((value: object) => value);
    const save = jest.fn(async (value: object) => value);
    const manager = {
      getRepository: jest.fn().mockReturnValue({ create, save }),
    } as unknown as EntityManager;
    const employee = { id: "7" } as EmployeeEntity;

    await new SessionRepository().create(manager, {
      employee,
      expiresAt: new Date("2026-09-15T12:00:00.000Z"),
      tokenHash: "a".repeat(64),
    });
    await new AuditRepository().create(manager, {
      action: "LOGIN",
      employee,
      entityId: "1",
      entityType: "session",
      module: "authentication",
      result: AUDIT_RESULTS.SUCCESS,
    });

    expect(manager.getRepository).toHaveBeenNthCalledWith(1, SessionEntity);
    expect(manager.getRepository).toHaveBeenNthCalledWith(2, AuditLogEntity);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reads the required Google client ID and exact administrative origins", () => {
    expect(
      readAuthenticationEnvironment({
        ADMIN_WEB_ORIGINS: "https://admin.transmetro.gt, http://localhost:5173",
        GOOGLE_WEB_CLIENT_ID: "client-id",
      }),
    ).toEqual({
      adminWebOrigins: ["https://admin.transmetro.gt", "http://localhost:5173"],
      googleWebClientId: "client-id",
    });
  });

  it.each([
    { ADMIN_WEB_ORIGINS: "https://admin.transmetro.gt" },
    { ADMIN_WEB_ORIGINS: "not-an-origin", GOOGLE_WEB_CLIENT_ID: "client-id" },
    { ADMIN_WEB_ORIGINS: "ftp://admin.transmetro.gt", GOOGLE_WEB_CLIENT_ID: "client-id" },
  ])("rejects an incomplete or malformed authentication configuration", (environment) => {
    expect(() => readAuthenticationEnvironment(environment)).toThrow(
      AuthenticationConfigurationError,
    );
  });

  it("uses only a distinct test database for integration scenarios", () => {
    expect(
      readIntegrationDatabaseEnvironment({
        DATABASE_NAME: "development_database",
        TEST_DATABASE_NAME: "integration_test",
      }),
    ).toEqual({
      database: "integration_test",
      host: "localhost",
      password: undefined,
      port: 5432,
      ssl: false,
      username: "transmetro",
    });
  });

  it.each([
    { DATABASE_NAME: "development_database" },
    {
      DATABASE_NAME: "development_database",
      TEST_DATABASE_NAME: "development_database",
    },
    {
      DATABASE_NAME: "development_database",
      TEST_DATABASE_NAME: "integration_database",
    },
  ])("rejects an unsafe integration database configuration", (environment) => {
    expect(() => readIntegrationDatabaseEnvironment(environment)).toThrow(
      IntegrationDatabaseConfigurationError,
    );
  });
});

// ============================================================================
// Contrato transaccional de login JWT stateless.
//
// La arquitectura es JWT stateless (decisión del usuario): `login` no crea ni
// rota ninguna fila de sesión. El contrato real es `LoginResult
// { token, expiresAt, usuario }` con auditoría `entityType: "jwt"` dentro de
// una única transacción. Estos tests fijan ese contrato; el diseño de cookie
// de sesión (`sessionHash`, `SessionRepository` en `login`) queda como alcance
// NO implementado, documentado en odd/tasks/fix-api-test-failures.md.
// ============================================================================

type AuditCreateInput = {
  action: string;
  employee: EmployeeEntity;
  entityId: string;
  entityType: string;
  module: string;
  result: string;
};

/**
 * Builds the 4 collaborators AuthenticationService actually takes:
 * `(dataSource, employeeRepo, auditRepo, googleVerifier)`.
 *
 * `auditRepo` stays the REAL AuditRepository so the test exercises the real
 * `manager.getRepository(AuditLogEntity).save(create(record))` path.
 */
function makeLoginHarness(
  employee: EmployeeEntity | null,
  verifiedEmail = "user@transmetro.gt",
) {
  const auditCreate = jest.fn((value: object) => value);
  const auditSave = jest.fn(async (value: object) => value);
  const manager = {
    getRepository: jest.fn((entity: Function) => {
      if (entity === AuditLogEntity) return { create: auditCreate, save: auditSave };
      return {
        create: jest.fn((value: object) => value),
        save: jest.fn(async (value: object) => value),
      };
    }),
  } as unknown as EntityManager;

  const transaction = jest.fn(
    async (callback: (m: EntityManager) => Promise<unknown>) => callback(manager),
  );
  const dataSource = { transaction } as unknown as DataSource;
  const employeeRepo = {
    findEligibleByEmail: jest.fn().mockResolvedValue(employee),
  };
  const googleVerifier = {
    verify: jest.fn().mockResolvedValue({ email: verifiedEmail, name: "Test User" }),
  };

  const service = new AuthenticationService(
    dataSource,
    employeeRepo as unknown as EmployeeRepository,
    new AuditRepository(),
    googleVerifier,
  );

  const lastAuditEntry = (): AuditCreateInput =>
    auditCreate.mock.calls[0][0] as AuditCreateInput;

  return { service, transaction, employeeRepo, googleVerifier, auditCreate, auditSave, manager, lastAuditEntry };
}

function makeEligibleEmployee(overrides: Partial<EmployeeEntity> = {}): EmployeeEntity {
  return {
    id: "emp-1",
    email: "user@transmetro.gt",
    status: EMPLOYEE_STATUSES.ACTIVE,
    role: {
      name: "OPERADOR",
      active: true,
      permissions: [{ code: "FLOTA_GESTIONAR" }, { code: "PERFIL_PROPIO_CONSULTAR" }],
    },
    ...overrides,
  } as EmployeeEntity;
}

describe("Login JWT stateless transactional contract", () => {
  it("issues a JWT and audits the attempt inside a single transaction", async () => {
    const { service, transaction, auditCreate, auditSave, lastAuditEntry } =
      makeLoginHarness(makeEligibleEmployee());

    const result = await service.login("credential");

    expect(result.token).toEqual(expect.any(String));
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.expiresAt).toBeInstanceOf(Date);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditSave).toHaveBeenCalledTimes(1);
    expect(lastAuditEntry()).toEqual(
      expect.objectContaining({
        action: "LOGIN",
        entityId: "emp-1",
        entityType: "jwt",
        module: "authentication",
        result: AUDIT_RESULTS.SUCCESS,
      }),
    );
  });

  it("signs a JWT whose payload carries employee, role, permissions and scope", async () => {
    const { service, lastAuditEntry } = makeLoginHarness(makeEligibleEmployee());

    const { token } = await service.login("credential");
    const payload = jwt.decode(token) as {
      employeeId: string;
      email: string;
      roles: string[];
      permissions: string[];
      scope: { role: string; modules: string[] };
      iat: number;
      exp: number;
    };

    expect(payload.employeeId).toBe("emp-1");
    expect(payload.email).toBe("user@transmetro.gt");
    expect(payload.roles).toEqual(["OPERADOR"]);
    expect(payload.permissions).toEqual(["FLOTA_GESTIONAR", "PERFIL_PROPIO_CONSULTAR"]);
    expect(payload.scope).toEqual({ role: "OPERADOR", modules: ["fleet", "self_profile"] });
    // JWT_EXPIRY is 12h; the payload must not advertise a shorter lifetime.
    expect(payload.exp - payload.iat).toBe(12 * 60 * 60);

    // Round trip: the issued token must verify through the real contract the
    // AuthenticationGuard calls, and the raw token must never reach the audit row.
    await expect(service.verifyToken(token)).resolves.toEqual(
      expect.objectContaining({
        employeeId: "emp-1",
        roles: ["OPERADOR"],
        permissions: ["FLOTA_GESTIONAR", "PERFIL_PROPIO_CONSULTAR"],
      }),
    );
    expect(JSON.stringify(lastAuditEntry())).not.toContain(token);
  });

  it("fixed 12-hour expiry, no sliding renewal", async () => {
    const before = new Date();
    const { service } = makeLoginHarness(makeEligibleEmployee());

    const result = await service.login("credential");

    const diff = result.expiresAt.getTime() - before.getTime();
    expect(diff).toBeGreaterThanOrEqual(11.9 * 60 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(12.1 * 60 * 60 * 1000);
  });

  it("bounded audit payload contains only safe fields", async () => {
    const { service, lastAuditEntry } = makeLoginHarness(makeEligibleEmployee());

    await service.login("credential");

    const created = lastAuditEntry();
    expect(created).toEqual(
      expect.objectContaining({
        action: "LOGIN",
        entityType: "jwt",
        module: "authentication",
        result: AUDIT_RESULTS.SUCCESS,
      }),
    );
    expect(created).not.toHaveProperty("credential");
    expect(created).not.toHaveProperty("rawToken");
    expect(created).not.toHaveProperty("token");
    expect(created).not.toHaveProperty("cookie");
    expect(created).not.toHaveProperty("ip");
    expect(created).not.toHaveProperty("userAgent");
  });

  it("inactive employee or no active role triggers generic denial", async () => {
    const { service, auditCreate, auditSave, lastAuditEntry } = makeLoginHarness(
      null,
      "inactive@transmetro.gt",
    );

    await expect(service.login("credential")).rejects.toEqual(
      expect.objectContaining({ message: "Credenciales inválidas." }),
    );

    // The failed attempt is still audited: only the fact that it happened.
    // No employee, no entity id and never the attempted email (S5).
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditSave).toHaveBeenCalledTimes(1);
    const entry = lastAuditEntry();
    expect(entry).toEqual(
      expect.objectContaining({
        action: "LOGIN",
        employee: null,
        entityId: null,
        entityType: "jwt",
        module: "authentication",
        result: AUDIT_RESULTS.FAILURE,
      }),
    );
    expect(JSON.stringify(entry).toLowerCase()).not.toContain("inactive@transmetro.gt");
  });

  it("commits the failed-login row: the transaction resolves and the 401 is thrown afterwards", async () => {
    const { service, transaction } = makeLoginHarness(null, "ghost@transmetro.gt");

    await expect(service.login("credential")).rejects.toEqual(
      expect.objectContaining({ message: "Credenciales inválidas." }),
    );

    // Throwing inside the callback would roll the audit row back; the
    // transaction must settle successfully so the FALLIDO row is persisted.
    expect(transaction).toHaveBeenCalledTimes(1);
    await expect(transaction.mock.results[0]!.value).resolves.toBeNull();
  });

  it("looks up the employee with the trimmed, uppercased verified email", async () => {
    const { service, employeeRepo, manager } = makeLoginHarness(
      makeEligibleEmployee({ email: "USER@TRANSMETRO.GT" }),
      "  User@Transmetro.GT  ",
    );

    await service.login("credential");

    expect(employeeRepo.findEligibleByEmail).toHaveBeenCalledTimes(1);
    expect(employeeRepo.findEligibleByEmail).toHaveBeenCalledWith(
      manager,
      "USER@TRANSMETRO.GT",
    );
  });
});
