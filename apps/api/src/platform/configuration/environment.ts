const DEFAULT_DATABASE_PORT = 5432;

export class AuthenticationConfigurationError extends Error {
  constructor() {
    super("Authentication configuration is invalid.");
    this.name = "AuthenticationConfigurationError";
  }
}

export class IntegrationDatabaseConfigurationError extends Error {
  constructor() {
    super("Integration database configuration is invalid.");
    this.name = "IntegrationDatabaseConfigurationError";
  }
}

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

export interface AuthenticationEnvironment {
  adminWebOrigins: string[];
  googleWebClientId: string;
}

function readOrigins(value: string | undefined): string[] {
  const origins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins === undefined || origins.length === 0) {
    throw new AuthenticationConfigurationError();
  }

  return origins.map((origin) => {
    try {
      const url = new URL(origin);

      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.origin !== origin
      ) {
        throw new AuthenticationConfigurationError();
      }
    } catch (error: unknown) {
      if (error instanceof AuthenticationConfigurationError) {
        throw error;
      }

      throw new AuthenticationConfigurationError();
    }

    return origin;
  });
}

export function readAuthenticationEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): AuthenticationEnvironment {
  const googleWebClientId = environment.GOOGLE_WEB_CLIENT_ID?.trim();

  if (googleWebClientId === undefined || googleWebClientId.length === 0) {
    throw new AuthenticationConfigurationError();
  }

  return {
    adminWebOrigins: readOrigins(environment.ADMIN_WEB_ORIGINS),
    googleWebClientId,
  };
}

export interface DemoRoleSwitchEnvironment {
  enabled: boolean;
  allowedEmails: string[];
}

// Demo role switch (academic review only). Disabled unless explicitly turned
// on; DEMO_ROLE_SWITCH_EMAILS is a comma-separated list of reviewer emails.
export function readDemoRoleSwitchEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DemoRoleSwitchEnvironment {
  const allowedEmails = (environment.DEMO_ROLE_SWITCH_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  return {
    enabled: parseBoolean(environment.DEMO_ROLE_SWITCH_ENABLED),
    allowedEmails,
  };
}

function createDatabaseEnvironment(
  environment: NodeJS.ProcessEnv,
  database: string,
): DatabaseEnvironment {
  return {
    database,
    host: environment.DATABASE_HOST ?? "localhost",
    password: environment.DATABASE_PASSWORD,
    port: parsePort(environment.DATABASE_PORT),
    ssl: parseBoolean(environment.DATABASE_SSL),
    username: environment.DATABASE_USER ?? "transmetro",
  };
}

export function readDatabaseEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  return createDatabaseEnvironment(
    environment,
    environment.DATABASE_NAME ?? "transmetro",
  );
}

export function readIntegrationDatabaseEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DatabaseEnvironment {
  const developmentDatabase = environment.DATABASE_NAME?.trim();
  const testDatabase = environment.TEST_DATABASE_NAME?.trim();

  if (
    developmentDatabase === undefined ||
    developmentDatabase.length === 0 ||
    testDatabase === undefined ||
    testDatabase.length === 0 ||
    testDatabase === developmentDatabase ||
    !testDatabase.endsWith("_test")
  ) {
    throw new IntegrationDatabaseConfigurationError();
  }

  return createDatabaseEnvironment(environment, testDatabase);
}
