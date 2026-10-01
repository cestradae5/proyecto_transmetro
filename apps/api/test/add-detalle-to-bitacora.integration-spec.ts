// Proves the tbl_bitacora.detalle migration behaves correctly against a real
// Postgres instance — the one thing a mocked DataSource cannot show.
//
// Two properties are asserted, and they are the two properties that matter:
//
//  1. It evolves a LEGACY database. A fresh database provisioned from
//     database/init.sql already has `detalle` (it is in the CREATE TABLE), so
//     re-running init.sql can never add it to a database that predates the
//     column — CREATE TABLE IF NOT EXISTS is a silent no-op on an existing
//     table. The migration is the only thing that can close that gap, so the
//     test drops the column to reproduce the legacy shape and proves `up` adds
//     it back.
//  2. It is idempotent in BOTH directions, because the column is already
//     present on any database provisioned from the current init.sql.

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DataSource, type QueryRunner } from "typeorm";

import { readIntegrationDatabaseEnvironment } from "../src/platform/configuration/environment.js";
import { cleanupIsolatedSchema } from "../src/platform/database/isolated-schema-lifecycle.js";
import { AddDetalleToBitacora1790869363470 } from "../src/platform/database/migrations/1790869363470-AddDetalleToBitacora.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const baselinePath = resolve(currentDirectory, "..", "..", "..", "database", "init.sql");

interface DetalleColumnRow {
  columnDefault: string | null;
  dataType: string;
  isNullable: string;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

describe("AddDetalleToBitacora migration", () => {
  const migration = new AddDetalleToBitacora1790869363470();
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
    schemaName = `bitacora_detalle_${randomUUID().replaceAll("-", "")}`;
    await queryRunner.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    await queryRunner.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
    await queryRunner.query(await readFile(baselinePath, "utf8"));
  });

  afterAll(async () => {
    await cleanupIsolatedSchema({ dataSource, queryRunner, schemaName });
  });

  async function readDetalleColumn(): Promise<DetalleColumnRow | undefined> {
    const rows = (await queryRunner!.query(
      `SELECT data_type AS "dataType",
              is_nullable AS "isNullable",
              column_default AS "columnDefault"
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'tbl_bitacora'
          AND column_name = 'detalle'`,
      [schemaName],
    )) as DetalleColumnRow[];

    return rows[0];
  }

  async function dropDetalleColumn(): Promise<void> {
    await queryRunner!.query(`ALTER TABLE "tbl_bitacora" DROP COLUMN IF EXISTS "detalle"`);
  }

  it("leaves the current init.sql baseline untouched (fresh databases already have the column)", async () => {
    await expect(readDetalleColumn()).resolves.toMatchObject({
      dataType: "jsonb",
      isNullable: "YES",
    });
  });

  it("adds a nullable, default-less detalle column to a legacy database", async () => {
    await dropDetalleColumn();
    await expect(readDetalleColumn()).resolves.toBeUndefined();

    await migration.up(queryRunner!);

    await expect(readDetalleColumn()).resolves.toEqual({
      columnDefault: null,
      dataType: "jsonb",
      isNullable: "YES",
    });
  });

  it("is idempotent on up, so it can run against a database that already has the column", async () => {
    await expect(migration.up(queryRunner!)).resolves.toBeUndefined();

    await expect(readDetalleColumn()).resolves.toMatchObject({ dataType: "jsonb" });
  });

  it("reverts the column on down", async () => {
    await migration.down(queryRunner!);

    await expect(readDetalleColumn()).resolves.toBeUndefined();
  });

  it("is idempotent on down, so re-running it against a database without the column does not throw", async () => {
    await expect(migration.down(queryRunner!)).resolves.toBeUndefined();
  });

  it("round-trips: down then up restores the column", async () => {
    await migration.up(queryRunner!);

    await expect(readDetalleColumn()).resolves.toMatchObject({
      dataType: "jsonb",
      isNullable: "YES",
    });
  });
});
