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
    migrations: [join(currentDirectory, "migrations", "*.{js,ts}")],
  };
}

export function createTypeOrmModuleOptions(): TypeOrmModuleOptions {
  return {
    ...createDataSourceOptions(),
    autoLoadEntities: true,
  };
}
