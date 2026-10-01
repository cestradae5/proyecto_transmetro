import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TypeOrmModuleOptions } from "@nestjs/typeorm";
import type { DataSourceOptions } from "typeorm";

import { readDatabaseEnvironment } from "../configuration/environment.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

export function createDataSourceOptions(
  environment: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  const database = readDatabaseEnvironment(environment);

  return {
    type: "postgres",
    host: database.host,
    port: database.port,
    database: database.database,
    username: database.username,
    password: database.password,
    ssl: database.ssl,
    synchronize: false,
    migrationsRun: false,
    entities: [
      join(currentDirectory, "..", "..", "**", "*.entity.{js,ts}"),
    ],
    // No `migrations` glob. Schema is owned by `database/init.sql`, applied
    // with `npm run db:schema`. It is idempotent for both a fresh database
    // (CREATE TABLE IF NOT EXISTS) and an existing one (ALTER TABLE ... ADD
    // COLUMN IF NOT EXISTS), so it is the single source of truth.
  };
}

export function createTypeOrmModuleOptions(): TypeOrmModuleOptions {
  return {
    ...createDataSourceOptions(),
    autoLoadEntities: true,
  };
}
