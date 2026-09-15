const DEFAULT_DATABASE_PORT = 5432;

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_DATABASE_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DATABASE_PORT must be a valid TCP port.");
  }

  return port;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

export interface DatabaseEnvironment {
  database: string;
  host: string;
  password: string | undefined;
  port: number;
  ssl: boolean;
  username: string;
}

export function readDatabaseEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  return {
    database: environment.DATABASE_NAME ?? "transmetro",
    host: environment.DATABASE_HOST ?? "localhost",
    password: environment.DATABASE_PASSWORD,
    port: parsePort(environment.DATABASE_PORT),
    ssl: parseBoolean(environment.DATABASE_SSL),
    username: environment.DATABASE_USER ?? "transmetro",
  };
}
