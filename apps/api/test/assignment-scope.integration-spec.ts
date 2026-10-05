import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DataSource, type QueryRunner } from "typeorm";

import { AssignmentScopeRepository } from "../src/authentication/infrastructure/assignment-scope.repository.js";
import { readIntegrationDatabaseEnvironment } from "../src/platform/configuration/environment.js";
import { cleanupIsolatedSchema } from "../src/platform/database/isolated-schema-lifecycle.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const baselinePath = resolve(currentDirectory, "..", "..", "..", "database", "init.sql");

const ASSIGNMENT_STATES = {
  ACTIVE: "ACTIVA",
  INACTIVE: "INACTIVA",
  INVALID: "PENDIENTE",
} as const;

const CANONICAL_ROLE_PERMISSIONS = {
  ADMINISTRADOR_SISTEMA: [
    "ALERTAS_ESTACION_GESTIONAR",
    "ALERTAS_OPERATIVAS_GESTIONAR",
    "ALERTAS_UNIDAD_GESTIONAR",
    "AUDITORIA_BITACORA_CONSULTAR",
    "EMPLEADOS_PERFILES_ADMINISTRAR",
    "FLOTA_ESTACION_CONSULTAR",
    "FLOTA_ESTACION_SOLICITAR",
    "FLOTA_GESTIONAR",
    "INFRAESTRUCTURA_GESTIONAR",
    "METRICAS_UNIDAD_REPORTAR",
    "PANEL_OPERATIVO_CENTRAL_USAR",
    "PERFIL_PROPIO_CONSULTAR",
    "RECARGAS_REPORTES_CONSULTAR",
    "REPORTES_ADMINISTRATIVOS_CONSULTAR",
    "ROLES_PERMISOS_ADMINISTRAR",
    "UNIDAD_ASIGNADA_CONSULTAR",
  ],
  GUARDIA: ["PERFIL_PROPIO_CONSULTAR"],
  OPERADOR_CENTRAL: [
    "ALERTAS_OPERATIVAS_GESTIONAR",
    "AUDITORIA_BITACORA_CONSULTAR",
    "EMPLEADOS_PERFILES_ADMINISTRAR",
    "FLOTA_ESTACION_CONSULTAR",
    "FLOTA_GESTIONAR",
    "INFRAESTRUCTURA_GESTIONAR",
    "PANEL_OPERATIVO_CENTRAL_USAR",
    "PERFIL_PROPIO_CONSULTAR",
    "RECARGAS_REPORTES_CONSULTAR",
    "REPORTES_ADMINISTRATIVOS_CONSULTAR",
  ],
  OPERADOR_ESTACION: [
    "ALERTAS_ESTACION_GESTIONAR",
    "FLOTA_ESTACION_CONSULTAR",
    "FLOTA_ESTACION_SOLICITAR",
    "PERFIL_PROPIO_CONSULTAR",
  ],
  PILOTO: [
    "ALERTAS_UNIDAD_GESTIONAR",
    "METRICAS_UNIDAD_REPORTAR",
    "PERFIL_PROPIO_CONSULTAR",
    "UNIDAD_ASIGNADA_CONSULTAR",
  ],
} as const;

interface IdRow {
  id: string;
}

interface PermissionRow {
  permissionCodes: string[];
  roleCode: string;
}

interface StateColumnRow {
  columnDefault: string | null;
  tableName: string;
}

interface TableRow {
  tableName: string;
}

interface ScopeFixture {
  activeLineId: string;
  activeStationId: string;
  employeeId: string;
  inactiveLineId: string;
  inactiveStationId: string;
  unitId: string;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

describe("AssignmentScopeRepository fresh baseline integration", () => {
  let dataSource: DataSource | undefined;
  let queryRunner: QueryRunner | undefined;
  let schemaName: string | undefined;

  beforeAll(async () => {
    const database = readIntegrationDatabaseEnvironment();
    dataSource = new DataSource({
      database: database.database,
      host: database.host,
      logging: false,
      password: database.password,
      port: database.port,
      ssl: database.ssl,
      synchronize: false,
      type: "postgres",
      username: database.username,
    });
    await dataSource.initialize();

    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    schemaName = `assignment_scope_${randomUUID().replaceAll("-", "")}`;
    await queryRunner.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await queryRunner.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
    await queryRunner.query(await readFile(baselinePath, "utf8"));
  });

  afterAll(async () => {
    await cleanupIsolatedSchema({ dataSource, queryRunner, schemaName });
  });

  async function query<T extends object>(statement: string, parameters: (number | string)[] = []): Promise<T[]> {
    return queryRunner!.query(statement, parameters) as Promise<T[]>;
  }

  async function insertId(statement: string, parameters: (number | string)[] = []): Promise<string> {
    const [row] = await query<IdRow>(statement, parameters);

    if (row === undefined) {
      throw new Error("Expected INSERT RETURNING to produce an ID row.");
    }

    return row.id;
  }

  async function createEmployee(suffix: string): Promise<string> {
    return insertId(
      `INSERT INTO tbl_empleado (nombre_emple, estado_emple, correo_emple, id_rol)
       SELECT $1, 'ACTIVO', $2, id_rol
       FROM tbl_rol
       WHERE codigo = 'OPERADOR_ESTACION'
       RETURNING id_emple AS id`,
      [`Scope employee ${suffix}`, `scope-${suffix}@example.test`],
    );
  }

  async function createScopeFixture(): Promise<ScopeFixture> {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const employeeId = await createEmployee(suffix);
    const activeStopId = await insertId(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA')
       RETURNING id_parada AS id`,
      [`Active stop ${suffix}`],
    );
    const inactiveStopId = await insertId(
      `INSERT INTO tbl_parada (nombre_parada, latitud, longitud, estado_parada)
       VALUES ($1, 14.7, -90.6, 'ACTIVA')
       RETURNING id_parada AS id`,
      [`Inactive stop ${suffix}`],
    );
    const activeStationId = await insertId(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
       VALUES ($1, 14.6, -90.5, 'ACTIVA', $2)
       RETURNING id_estacion AS id`,
      [`Active station ${suffix}`, activeStopId],
    );
    const inactiveStationId = await insertId(
      `INSERT INTO tbl_estacion (nombre_estacion, latitud, longitud, estado_estacion, id_parada)
       VALUES ($1, 14.7, -90.6, 'ACTIVA', $2)
       RETURNING id_estacion AS id`,
      [`Inactive station ${suffix}`, inactiveStopId],
    );
    const parkingId = await insertId(
      `INSERT INTO tbl_parqueo (nombre_parqueo, tipo_parqueo, direccion, latitud, longitud, capacidad_unidades, estado_parqueo, id_estacion)
       VALUES ($1, 'CENTRAL', 'Test address', 14.6, -90.5, 10, 'ACTIVO', $2)
       RETURNING id_parqueo AS id`,
      [`Scope parking ${suffix}`, activeStationId],
    );
    const activeLineId = await insertId(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido, id_parqueo)
       VALUES ($1, $2, '#000000', 'ACTIVA', 'LINEAL', $3)
       RETURNING id_linea AS id`,
      [`A-${suffix}`, `Active line ${suffix}`, parkingId],
    );
    const inactiveLineId = await insertId(
      `INSERT INTO tbl_linea (numero_linea, nombre_linea, color_hex, estado_linea, tipo_recorrido, id_parqueo)
       VALUES ($1, $2, '#111111', 'ACTIVA', 'LINEAL', $3)
       RETURNING id_linea AS id`,
      [`I-${suffix}`, `Inactive line ${suffix}`, parkingId],
    );
    const unitId = await insertId(
      `INSERT INTO tbl_unidad (numero_placa, marca, modelo, anio, capacidad_pasajeros, estado_unidad)
       VALUES ($1, 'Test', 'Scope', 2026, 20, 'DISPONIBLE')
       RETURNING id_unidad AS id`,
      [`S-${suffix}`],
    );

    await query(
      `INSERT INTO tbl_asignacion_estacion (fecha_asignacion, estado_asignacion, id_empleado, id_estacion)
       VALUES (CURRENT_TIMESTAMP, $1, $2, $3), (CURRENT_TIMESTAMP, $4, $2, $5)`,
      [
        ASSIGNMENT_STATES.ACTIVE,
        employeeId,
        activeStationId,
        ASSIGNMENT_STATES.INACTIVE,
        inactiveStationId,
      ],
    );
    await query(
      `INSERT INTO tbl_estacion_linea (id_linea, id_estacion, tipo_punto, estado_asignacion)
       VALUES ($1, $2, 'PRINCIPAL', $3), ($4, $2, 'APOYO', $5)`,
      [
        activeLineId,
        activeStationId,
        ASSIGNMENT_STATES.ACTIVE,
        inactiveLineId,
        ASSIGNMENT_STATES.INACTIVE,
      ],
    );
    await query(
      `INSERT INTO tbl_asignacion_unidad (fecha_asignacion, id_unidad, id_linea)
       VALUES (CURRENT_TIMESTAMP, $1, $2)`,
      [unitId, activeLineId],
    );
    await query(
      `INSERT INTO tbl_asignacion_piloto (fecha_asignacion, id_empleado, id_unidad)
       VALUES (CURRENT_TIMESTAMP, $1, $2)`,
      [employeeId, unitId],
    );

    return {
      activeLineId,
      activeStationId,
      employeeId,
      inactiveLineId,
      inactiveStationId,
      unitId,
    };
  }

  it("seeds only the canonical permission codes and five-role mappings", async () => {
    const permissionRows = await query<{ permissionCode: string }>(
      "SELECT codigo_permiso AS \"permissionCode\" FROM tbl_permiso ORDER BY codigo_permiso",
    );
    const expectedPermissions = [...new Set(Object.values(CANONICAL_ROLE_PERMISSIONS).flat())].sort();

    expect(permissionRows.map((row) => row.permissionCode)).toEqual(expectedPermissions);

    const roleRows = await query<PermissionRow>(
      `SELECT rol.codigo AS "roleCode", ARRAY_AGG(permiso.codigo_permiso ORDER BY permiso.codigo_permiso) AS "permissionCodes"
       FROM tbl_rol AS rol
       INNER JOIN tbl_rol_permiso AS rol_permiso ON rol_permiso.id_rol = rol.id_rol
       INNER JOIN tbl_permiso AS permiso ON permiso.id_permiso = rol_permiso.id_permiso
       GROUP BY rol.codigo
       ORDER BY rol.codigo`,
    );

    expect(Object.fromEntries(roleRows.map((row) => [row.roleCode, row.permissionCodes]))).toEqual(
      Object.fromEntries(
        Object.entries(CANONICAL_ROLE_PERMISSIONS).map(([roleCode, permissions]) => [
          roleCode,
          [...permissions].sort(),
        ]),
      ),
    );
  });

  it("restricts assignment states without defaults and keeps pilot and unit assignments state-free", async () => {
    const stateColumns = await query<StateColumnRow>(
      `SELECT table_name AS "tableName", column_default AS "columnDefault"
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND column_name = 'estado_asignacion'
       ORDER BY table_name`,
    );

    expect(stateColumns).toEqual([
      { columnDefault: null, tableName: "tbl_asignacion_estacion" },
      { columnDefault: null, tableName: "tbl_estacion_linea" },
    ]);

    const unexpectedStateColumns = await query<TableRow>(
      `SELECT table_name AS "tableName"
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name IN ('tbl_asignacion_piloto', 'tbl_asignacion_unidad')
         AND column_name = 'estado_asignacion'`,
    );

    expect(unexpectedStateColumns).toEqual([]);

    const fixture = await createScopeFixture();

    await expect(
      query(
        `INSERT INTO tbl_asignacion_estacion (fecha_asignacion, estado_asignacion, id_empleado, id_estacion)
         VALUES (CURRENT_TIMESTAMP, $1, $2, $3)`,
        [ASSIGNMENT_STATES.INVALID, fixture.employeeId, fixture.inactiveStationId],
      ),
    ).rejects.toThrow();
    await expect(
      query(
        `INSERT INTO tbl_estacion_linea (id_linea, id_estacion, tipo_punto, estado_asignacion)
         VALUES ($1, $2, 'CONTROL', $3)`,
        [fixture.inactiveLineId, fixture.inactiveStationId, ASSIGNMENT_STATES.INVALID],
      ),
    ).rejects.toThrow();
  });

  it("returns only active station and line assignments plus the employee's assigned unit", async () => {
    const fixture = await createScopeFixture();

    await expect(new AssignmentScopeRepository(queryRunner!).findByEmployeeId(fixture.employeeId)).resolves.toEqual({
      lineIds: [fixture.activeLineId],
      stationIds: [fixture.activeStationId],
      unitIds: [fixture.unitId],
    });
  });

  it("excludes an active station-line when the employee station assignment is inactive", async () => {
    const fixture = await createScopeFixture();

    await query(
      `UPDATE tbl_asignacion_estacion
       SET estado_asignacion = $1
       WHERE id_empleado = $2
         AND id_estacion = $3`,
      [
        ASSIGNMENT_STATES.INACTIVE,
        fixture.employeeId,
        fixture.activeStationId,
      ],
    );

    await expect(
      new AssignmentScopeRepository(queryRunner!).findByEmployeeId(
        fixture.employeeId,
      ),
    ).resolves.toEqual({
      lineIds: [],
      stationIds: [],
      unitIds: [fixture.unitId],
    });
  });

  it("returns an empty scope when an employee has no qualifying assignments", async () => {
    const employeeId = await createEmployee(randomUUID().replaceAll("-", "").slice(0, 12));

    await expect(new AssignmentScopeRepository(queryRunner!).findByEmployeeId(employeeId)).resolves.toEqual({
      lineIds: [],
      stationIds: [],
      unitIds: [],
    });
  });
});
