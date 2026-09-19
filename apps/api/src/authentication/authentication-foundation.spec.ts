import { jest } from "@jest/globals";
import type { EntityManager } from "typeorm";
import { getMetadataArgsStorage } from "typeorm";

import {
  AuthenticationConfigurationError,
  IntegrationDatabaseConfigurationError,
  readAuthenticationEnvironment,
  readIntegrationDatabaseEnvironment,
} from "../platform/configuration/environment.js";
import { AuditLogEntity, AUDIT_RESULTS } from "./entities/audit-log.entity.js";
import { EmployeeEntity } from "./entities/employee.entity.js";
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
// TESTS RED — Contrato transaccional del ciclo de vida de sesión (task 1.3)
// Estos tests definen el comportamiento ANTES de implementar AuthenticationService.
// Cada test falla (RED) hasta que el service implemente la regla correspondiente.
// ============================================================================

describe("Session lifecycle transactional contract (RED)", () => {
  type SessionCreateInput = {
    employee: EmployeeEntity;
    expiresAt: Date;
    tokenHash: string;
  };

  type AuditCreateInput = {
    action: string;
    employee: EmployeeEntity;
    entityId: string;
    entityType: string;
    module: string;
    result: string;
  };

  function makeMockDataSource(
    employeeRepoReturn: EmployeeEntity | null,
    sessionCreateReturn: SessionCreateInput & { id: string },
    auditCreateReturn: AuditCreateInput & { id: string },
  ) {
    const sessionCreate = jest.fn(async (v: object) => v);
    const sessionSave = jest.fn(async (v: object) => v);
    const auditCreate = jest.fn(async (v: object) => v);
    const auditSave = jest.fn(async (v: object) => v);
    
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(employeeRepoReturn),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };
    
    const employeeRepo = {
      findEligibleByEmail: jest.fn().mockResolvedValue(employeeRepoReturn),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const sessionRepo = { create: sessionCreate, save: sessionSave, deleteByEmployeeId: jest.fn().mockResolvedValue(undefined) };
    const auditRepo = { create: auditCreate, save: auditSave };
    const mockManager = {
      getRepository: jest.fn((entity: Function) => {
        if (entity === EmployeeEntity) return employeeRepo;
        if (entity === SessionEntity) return { ...sessionRepo, delete: jest.fn().mockResolvedValue(undefined) };
        if (entity === AuditLogEntity) return auditRepo;
        return { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) };
      }),
    };
    const mockTransaction = jest.fn(async (cb: (m: any) => Promise<any>) => cb(mockManager));
    const dataSource = {
      transaction: mockTransaction,
      getRepository: jest.fn((entity: Function) => {
        if (entity === SessionEntity) return { findOne: jest.fn().mockResolvedValue(null) };
        if (entity === EmployeeEntity) return employeeRepo;
        return { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) };
      }),
    };
    return { dataSource, sessionCreate, sessionSave, auditCreate, auditSave, mockTransaction, queryBuilder };
  }

  function makeVerifier(email: string, shouldFail = false) {
    return {
      verify: jest.fn().mockResolvedValue(shouldFail ? null : { email: email.trim().toUpperCase(), name: "Test User" }),
    };
  }

  it("login replaces prior session atomically in one transaction", async () => {
    const { dataSource, sessionCreate, sessionSave, auditCreate, auditSave, mockTransaction } = makeMockDataSource(
      { id: "emp-1" } as EmployeeEntity,
      { id: "ses-1", employee: {} as EmployeeEntity, expiresAt: new Date(), tokenHash: "a".repeat(64) },
      { id: "aud-1", action: "LOGIN", employee: {} as EmployeeEntity, entityId: "ses-1", entityType: "session", module: "authentication", result: "SUCCESS" },
    );

    const { AuthenticationService } = await import("./authentication.service.js");
    const { EmployeeRepository } = await import("./infrastructure/employee.repository.js");
    const { SessionRepository } = await import("./infrastructure/session.repository.js");
    const { AuditRepository } = await import("./infrastructure/audit.repository.js");

    const service = new AuthenticationService(
      dataSource as any,
      new EmployeeRepository(),
      new SessionRepository(dataSource as any),
      new AuditRepository(),
      makeVerifier("user@transmetro.gt"),
    );

    await expect(service.login("credential")).resolves.toEqual(
      expect.objectContaining({
        sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    );

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(sessionCreate).toHaveBeenCalledTimes(1);
    expect(sessionSave).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledTimes(1);
    expect(auditSave).toHaveBeenCalledTimes(1);
  });

  it("session id stored as SHA-256 only, raw token never persists", async () => {
    const { dataSource, sessionCreate } = makeMockDataSource(
      { id: "emp-2" } as EmployeeEntity,
      { id: "ses-2", employee: {} as EmployeeEntity, expiresAt: new Date(), tokenHash: "b".repeat(64) },
      { id: "aud-2", action: "LOGIN", employee: {} as EmployeeEntity, entityId: "ses-2", entityType: "session", module: "authentication", result: "SUCCESS" },
    );

    const { AuthenticationService } = await import("./authentication.service.js");
    const { EmployeeRepository } = await import("./infrastructure/employee.repository.js");
    const { SessionRepository } = await import("./infrastructure/session.repository.js");
    const { AuditRepository } = await import("./infrastructure/audit.repository.js");

    const service = new AuthenticationService(
      dataSource as any,
      new EmployeeRepository(),
      new SessionRepository(dataSource as any),
      new AuditRepository(),
      makeVerifier("user2@transmetro.gt"),
    );

    const result = await service.login("credential");
    expect(result.sessionHash).toMatch(/^[a-f0-9]{64}$/);
    const created = sessionCreate.mock.calls[0][0] as SessionCreateInput;
    expect(created.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fixed 12-hour expiry, no sliding renewal", async () => {
    const before = new Date();
    const { dataSource, sessionCreate } = makeMockDataSource(
      { id: "emp-3" } as EmployeeEntity,
      { id: "ses-3", employee: {} as EmployeeEntity, expiresAt: new Date(), tokenHash: "c".repeat(64) },
      { id: "aud-3", action: "LOGIN", employee: {} as EmployeeEntity, entityId: "ses-3", entityType: "session", module: "authentication", result: "SUCCESS" },
    );

    const { AuthenticationService } = await import("./authentication.service.js");
    const { EmployeeRepository } = await import("./infrastructure/employee.repository.js");
    const { SessionRepository } = await import("./infrastructure/session.repository.js");
    const { AuditRepository } = await import("./infrastructure/audit.repository.js");

    const service = new AuthenticationService(
      dataSource as any,
      new EmployeeRepository(),
      new SessionRepository(dataSource as any),
      new AuditRepository(),
      makeVerifier("user3@transmetro.gt"),
    );

    const result = await service.login("credential");
    const diff = result.expiresAt.getTime() - before.getTime();
    expect(diff).toBeGreaterThanOrEqual(11.9 * 60 * 60 * 1000);
    expect(diff).toBeLessThanOrEqual(12.1 * 60 * 60 * 1000);
  });

  it("bounded audit payload contains only safe fields", async () => {
    const { dataSource, auditCreate } = makeMockDataSource(
      { id: "emp-4" } as EmployeeEntity,
      { id: "ses-4", employee: {} as EmployeeEntity, expiresAt: new Date(), tokenHash: "d".repeat(64) },
      { id: "aud-4", action: "LOGIN", employee: {} as EmployeeEntity, entityId: "ses-4", entityType: "session", module: "authentication", result: "EXITOSO" },
    );

    const { AuthenticationService } = await import("./authentication.service.js");
    const { EmployeeRepository } = await import("./infrastructure/employee.repository.js");
    const { SessionRepository } = await import("./infrastructure/session.repository.js");
    const { AuditRepository } = await import("./infrastructure/audit.repository.js");

    const service = new AuthenticationService(
      dataSource as any,
      new EmployeeRepository(),
      new SessionRepository(dataSource as any),
      new AuditRepository(),
      makeVerifier("user4@transmetro.gt"),
    );

    await service.login("credential");
    const created = auditCreate.mock.calls[0][0] as AuditCreateInput;
    expect(created).toEqual(
      expect.objectContaining({
        action: "LOGIN",
        entityType: "session",
        module: "authentication",
        result: "EXITOSO",
      }),
    );
    expect(created).not.toHaveProperty("credential");
    expect(created).not.toHaveProperty("rawToken");
    expect(created).not.toHaveProperty("cookie");
    expect(created).not.toHaveProperty("ip");
    expect(created).not.toHaveProperty("userAgent");
  });

  it("inactive employee or no active role triggers generic denial", async () => {
    const { dataSource } = makeMockDataSource(
      null,
      { id: "ses-5", employee: {} as EmployeeEntity, expiresAt: new Date(), tokenHash: "e".repeat(64) },
      { id: "aud-5", action: "LOGIN", employee: {} as EmployeeEntity, entityId: "ses-5", entityType: "session", module: "authentication", result: "SUCCESS" },
    );

    const { AuthenticationService } = await import("./authentication.service.js");
    const { EmployeeRepository } = await import("./infrastructure/employee.repository.js");
    const { SessionRepository } = await import("./infrastructure/session.repository.js");
    const { AuditRepository } = await import("./infrastructure/audit.repository.js");

    const service = new AuthenticationService(
      dataSource as any,
      new EmployeeRepository(),
      new SessionRepository(dataSource as any),
      new AuditRepository(),
      makeVerifier("inactive@transmetro.gt"),
    );

    await expect(service.login("credential")).rejects.toEqual(
      expect.objectContaining({ message: "Credenciales inválidas." }),
    );
  });

  it("verified email lookup is case-insensitive", async () => {
    const { dataSource, sessionCreate } = makeMockDataSource(
      { id: "emp-6" } as EmployeeEntity,
      { id: "ses-6", employee: {} as EmployeeEntity, expiresAt: new Date(), tokenHash: "f".repeat(64) },
      { id: "aud-6", action: "LOGIN", employee: {} as EmployeeEntity, entityId: "ses-6", entityType: "session", module: "authentication", result: "SUCCESS" },
    );

    const { AuthenticationService } = await import("./authentication.service.js");
    const { EmployeeRepository } = await import("./infrastructure/employee.repository.js");
    const { SessionRepository } = await import("./infrastructure/session.repository.js");
    const { AuditRepository } = await import("./infrastructure/audit.repository.js");

    const service = new AuthenticationService(
      dataSource as any,
      new EmployeeRepository(),
      new SessionRepository(dataSource as any),
      new AuditRepository(),
      makeVerifier("  USER@TRANSMETRO.GT  "),
    );

    await service.login("credential");
    const repo = new EmployeeRepository();
    const mockManager = { getRepository: () => ({ createQueryBuilder: () => ({ andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue({ id: "emp-6" }), innerJoinAndSelect: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis() }) }) } as any;
    await repo.findEligibleByEmail(mockManager, "  USER@TRANSMETRO.GT  ");
  });
});
