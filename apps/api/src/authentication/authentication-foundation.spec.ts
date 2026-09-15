import { getMetadataArgsStorage } from "typeorm";

import { AuditLogEntity, AUDIT_RESULTS } from "./entities/audit-log.entity.js";
import { EmployeeEntity } from "./entities/employee.entity.js";
import { PermissionEntity } from "./entities/permission.entity.js";
import { RoleEntity } from "./entities/role.entity.js";
import { SessionEntity } from "./entities/session.entity.js";

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
});
