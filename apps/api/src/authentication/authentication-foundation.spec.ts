import { jest } from "@jest/globals";
import type { EntityManager } from "typeorm";
import { getMetadataArgsStorage } from "typeorm";

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
});
