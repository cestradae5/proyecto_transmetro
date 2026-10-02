// ============================================================================
// E2E HTTP contract for the authentication controller.
//
// This suite is fully mocked (DataSource + AuthenticationService + the Google
// verifier), so it asserts the HTTP surface only — never a real login.
//
// Requires apps/api/.env exported into the shell. jest-e2e.json has no dotenv
// `setupFiles`, so the run does not load .env by itself, and without it
// JWT_SECRET/DATABASE_* fall back to defaults. On Windows PowerShell:
//   Get-Content .env | Where-Object { $_ -match '^\s*[^#\s][^=]*=' } |
//     ForEach-Object { $k,$v = $_ -split '=',2; Set-Item -Path "Env:$($k.Trim())" -Value $v.Trim() }
//   npm run test:e2e
//
// Deliberately NOT asserted (unimplemented scope, documented in
// odd/tasks/fix-api-test-failures.md): Set-Cookie of any kind, session hashes,
// HTTP Origin enforcement, the `X-Transmetro-Request: admin-web` header, and CORS
// preflight headers. The controller implements none of them; login is stateless
// JWT over the OAuth code exchange, and the SPA holds the token.
// ============================================================================

// Configurar environment ANTES de cualquier import que lea process.env
process.env.ADMIN_WEB_ORIGINS = "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID = "test-client-id";

import { jest } from "@jest/globals";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import request from "supertest";

import { AuthenticationModule } from "../src/authentication/authentication.module.js";
import { GOOGLE_CREDENTIAL_VERIFIER } from "../src/authentication/infrastructure/google-credential-verifier.port.js";
import { AuthenticationService } from "../src/authentication/authentication.service.js";
import type { MeResult } from "../src/authentication/authentication.contracts.js";

const GOOGLE_OAUTH_HOST = "https://accounts.google.com/o/oauth2/v2/auth";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const TEST_CREDENTIAL = "test-id-token";
const VALID_TOKEN = "valid.jwt.token";
const INVALID_TOKEN = "not-a-valid-token";

const TEST_USER: MeResult = {
  employeeId: "emp-1",
  email: "admin@transmetro.gt",
  roles: ["ADMIN"],
  permissions: ["administration.read", "administration.write"],
  scope: { role: "ADMIN", modules: ["infrastructure", "fleet"] },
};

function makeMockVerifier() {
  return {
    verify: jest.fn().mockResolvedValue({ email: "admin@transmetro.gt", name: "Test User" }),
  };
}

/**
 * The real controller calls verifyToken(), not me(): `/me` reads
 * `Authorization: Bearer <token>` and hands the raw token to the service.
 */
function makeMockAuthenticationService(): AuthenticationService {
  const login = jest.fn();
  const verifyToken = jest.fn((token: string) => {
    if (token !== VALID_TOKEN) {
      return Promise.reject(new Error("Invalid token"));
    }
    return Promise.resolve(TEST_USER);
  });
  const logout = jest.fn().mockResolvedValue({ revoked: true });

  return { login, verifyToken, logout } as unknown as AuthenticationService;
}

function makeMockDataSource(): DataSource {
  return {
    transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
      cb({
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn().mockReturnValue({
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue({ id: "emp-1" }),
            innerJoinAndSelect: jest.fn().mockReturnThis(),
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
          }),
          create: jest.fn((v: object) => v),
          save: jest.fn(async (v: object) => v),
        }),
      }),
    ),
    getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }),
    isInitialized: true,
    destroy: jest.fn(async () => {}),
    initialize: jest.fn(async () => {}),
  } as unknown as DataSource;
}

// AuthenticationModule imports DatabaseModule so that `useExisting: DataSource`
// resolves on every boot path — AppModule omits DatabaseModule when
// NODE_ENV === "test", which is exactly the mode jest runs this suite in, so
// relying on AppModule alone leaves DataSource unresolvable here.
//
// The side effect is that TypeOrmModule.forRootAsync would open a real
// Postgres connection, which this suite must never do: it is a fully-mocked
// HTTP contract suite. Overriding the DataSource *class* token is what stops
// the connection — it replaces the forRootAsync factory that would build it,
// so `useExisting: DataSource` resolves to the mock instead. Overriding the
// DATASOURCE symbol alone would NOT help, because that provider is consumed by
// useExisting and the real DataSource would still be constructed.
async function createMockedAuthenticationModule(): Promise<{
  authenticationService: AuthenticationService;
  verifier: ReturnType<typeof makeMockVerifier>;
  compile(): Promise<{ createNestApplication(): INestApplication }>;
}> {
  return Test.createTestingModule({
    imports: [AuthenticationModule],
    providers: [
      { provide: GOOGLE_CREDENTIAL_VERIFIER, useValue: makeMockVerifier() },
    ],
  })
    .overrideProvider(DataSource)
    .useValue(makeMockDataSource())
    .overrideProvider(AuthenticationService)
    .useValue(makeMockAuthenticationService())
    .compile() as never;
}

describe("Authentication HTTP endpoints", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await createMockedAuthenticationModule();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // OAuth entry point — the SPA is redirected to Google, not POSTed a credential
  // --------------------------------------------------------------------------
  it("GET /authentication/google redirects to the Google consent screen", async () => {
    const response = await request(app.getHttpServer())
      .get("/authentication/google")
      .expect(302);

    const location = response.headers.location as string;
    expect(location.startsWith(`${GOOGLE_OAUTH_HOST}?`)).toBe(true);
    expect(location).toContain("client_id=test-client-id");
    expect(location).toContain("response_type=code");
    expect(location).toContain("scope=openid+email+profile");
    expect(location).toContain("access_type=offline");
    expect(location).toContain("prompt=select_account");
    expect(decodeURIComponent(location)).toContain("/authentication/google/callback");
  });

  it("GET /authentication/google/callback without a code redirects to the frontend error page", async () => {
    const response = await request(app.getHttpServer())
      .get("/authentication/google/callback")
      .expect(302);

    expect(response.headers.location).toBe(`${FRONTEND_URL}/login?error=denied`);
  });

  it("POST /authentication/google does not exist — login is the OAuth code exchange", async () => {
    await request(app.getHttpServer())
      .post("/authentication/google")
      .send({ credential: TEST_CREDENTIAL })
      .expect(404);
  });

  // --------------------------------------------------------------------------
  // Me endpoint — Authorization: Bearer only
  // --------------------------------------------------------------------------
  it("GET /authentication/me with a valid Bearer token returns 200", async () => {
    const response = await request(app.getHttpServer())
      .get("/authentication/me")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .expect(200);

    expect(response.body).toEqual(TEST_USER);
  });

  it("GET /authentication/me without an Authorization header returns 401", async () => {
    // A session cookie is deliberately present and must be ignored: the
    // controller reads the Authorization header and nothing else.
    await request(app.getHttpServer())
      .get("/authentication/me")
      .set("Cookie", `__Host-transmetro_admin_session=${"a".repeat(64)}`)
      .expect(401)
      .expect({ error: "AUTHENTICATION_REQUIRED" });
  });

  it("GET /authentication/me with an invalid token returns 401", async () => {
    await request(app.getHttpServer())
      .get("/authentication/me")
      .set("Authorization", `Bearer ${INVALID_TOKEN}`)
      .expect(401)
      .expect({ error: "AUTHENTICATION_REQUIRED" });
  });

  it("GET /authentication/me with a non-Bearer Authorization header returns 401", async () => {
    await request(app.getHttpServer())
      .get("/authentication/me")
      .set("Authorization", `Basic ${Buffer.from("user:pass").toString("base64")}`)
      .expect(401)
      .expect({ error: "AUTHENTICATION_REQUIRED" });
  });

  // --------------------------------------------------------------------------
  // Logout endpoint — stateless, POST-only, sets no cookie
  // --------------------------------------------------------------------------
  it("POST /authentication/logout returns 204 and sets no cookie", async () => {
    const response = await request(app.getHttpServer())
      .post("/authentication/logout")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .expect(204);

    // Nothing server-side to revoke and nothing to clear client-side from a
    // Set-Cookie header: the SPA deletes the token itself.
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("POST /authentication/logout without a token returns 204 (idempotent)", async () => {
    await request(app.getHttpServer())
      .post("/authentication/logout")
      .expect(204);
  });

  it("GET /authentication/logout returns 404 (POST-only enforced by the route decorator)", async () => {
    await request(app.getHttpServer())
      .get("/authentication/logout")
      .set("Authorization", `Bearer ${VALID_TOKEN}`)
      .expect(404);
  });
});