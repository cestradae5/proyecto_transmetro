// ============================================================================
// TESTS RED — E2E HTTP / Controller / Module / Cookies / CORS (task 2.2b)
// Estos tests definen el comportamiento HTTP ANTES de implementar el controller,
// module y wiring de cookies/CORS. Cada test falla (RED) hasta que el stack
// HTTP implemente la regla correspondiente.
// ============================================================================

// Configurar environment ANTES de cualquier import que lea process.env
process.env.ADMIN_WEB_ORIGINS = "https://admin.transmetro.gt";
process.env.GOOGLE_WEB_CLIENT_ID = "test-client-id";

import { jest } from "@jest/globals";
import { Test, TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import request from "supertest";

import { AuthenticationModule } from "../src/authentication/authentication.module.js";
import { GOOGLE_CREDENTIAL_VERIFIER, DATASOURCE } from "../src/authentication/infrastructure/google-credential-verifier.port.js";
import { AuthenticationService } from "../src/authentication/authentication.service.js";
import type { LoginResult, MeResult, LogoutResult } from "../src/authentication/authentication.contracts.js";

const ADMIN_ORIGIN = "https://admin.transmetro.gt";
const FORBIDDEN_ORIGIN = "https://evil.example.com";
const TEST_CREDENTIAL = "test-id-token";
const TEST_SESSION_HASH = "a".repeat(64);
const TEST_EXPIRES_AT = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

function makeMockVerifier(email: string) {
  return {
    verify: jest.fn().mockResolvedValue({ email: email.trim().toUpperCase(), name: "Test User" }),
  };
}

function makeMockAuthenticationService(sessionHash: string, email: string): AuthenticationService {
  const login = jest.fn().mockResolvedValue({ sessionHash, expiresAt: new Date(TEST_EXPIRES_AT) } as LoginResult);
  const me = jest.fn().mockImplementation((hash: string) => {
    if (hash === sessionHash) {
      return Promise.resolve({
        employeeId: "emp-1",
        email,
        roles: ["ADMIN"],
        permissions: ["administration.read", "administration.write"],
      } as MeResult);
    }
    return Promise.reject(new Error("Session expired"));
  });
  const logout = jest.fn().mockResolvedValue({ revoked: true } as LogoutResult);

  return { login, me, logout } as unknown as AuthenticationService;
}

function makeMockDataSource(): DataSource {
  return {
    transaction: jest.fn(async (cb: (m: any) => Promise<any>) => cb({
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
        delete: jest.fn(async () => undefined),
      }),
    })),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(null),
    }),
    isInitialized: true,
    destroy: jest.fn(async () => {}),
    initialize: jest.fn(async () => {}),
  } as unknown as DataSource;
}

describe("Authentication HTTP endpoints (RED)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AuthenticationModule],
      providers: [
        {
          provide: GOOGLE_CREDENTIAL_VERIFIER,
          useValue: makeMockVerifier("admin@transmetro.gt"),
        },
        {
          provide: DATASOURCE,
          useValue: makeMockDataSource(),
        },
      ],
    })
      .overrideProvider(AuthenticationService).useValue(makeMockAuthenticationService(TEST_SESSION_HASH, "ADMIN@TRANSMETRO.GT"))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // --------------------------------------------------------------------------
  // Login endpoint
  // --------------------------------------------------------------------------
  it("POST /authentication/google returns 200 with Set-Cookie header", async () => {
    const response = await request(app.getHttpServer())
      .post("/authentication/google")
      .set("Origin", ADMIN_ORIGIN)
      .set("X-Transmetro-Request", "admin-web")
      .send({ credential: TEST_CREDENTIAL })
      .expect(200);

    expect(response.headers["set-cookie"]).toBeDefined();
    const cookieHeader = response.headers["set-cookie"][0];
    expect(cookieHeader).toContain("__Host-transmetro_admin_session=");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("Secure");
    expect(cookieHeader).toContain("SameSite=None");
    expect(cookieHeader).toContain("Path=/");
    expect(cookieHeader).toContain("Max-Age=43200");
  });

  it("POST /authentication/google returns sessionHash as SHA-256 only", async () => {
    const response = await request(app.getHttpServer())
      .post("/authentication/google")
      .set("Origin", ADMIN_ORIGIN)
      .set("X-Transmetro-Request", "admin-web")
      .send({ credential: TEST_CREDENTIAL })
      .expect(200);

    expect(response.body.sessionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body.sessionHash).toHaveLength(64);
  });

  it("POST /authentication/google returns 403 for forbidden origin", async () => {
    await request(app.getHttpServer())
      .post("/authentication/google")
      .set("Origin", FORBIDDEN_ORIGIN)
      .set("X-Transmetro-Request", "admin-web")
      .send({ credential: TEST_CREDENTIAL })
      .expect(403)
      .expect({ error: "REQUEST_ORIGIN_DENIED" });
  });

  it("POST /authentication/google returns 403 when X-Transmetro-Request header is missing", async () => {
    await request(app.getHttpServer())
      .post("/authentication/google")
      .set("Origin", ADMIN_ORIGIN)
      .send({ credential: TEST_CREDENTIAL })
      .expect(403)
      .expect({ error: "REQUEST_ORIGIN_DENIED" });
  });

  it("POST /authentication/google returns 503 when verifier fails", async () => {
    const failingVerifier = {
      verify: jest.fn().mockRejectedValue(new Error("Google unavailable")),
    };

    function makeFailingAuthenticationService(): AuthenticationService {
      const login = jest.fn().mockRejectedValue(new Error("AUTHENTICATION_UNAVAILABLE"));
      const me = jest.fn().mockResolvedValue({
        employeeId: "emp-1",
        email: "admin@transmetro.gt",
        roles: ["ADMIN"],
        permissions: ["administration.read", "administration.write"],
      } as MeResult);
      const logout = jest.fn().mockResolvedValue({ revoked: true } as LogoutResult);
      return { login, me, logout } as unknown as AuthenticationService;
    }

    const failModuleRef: TestingModule = await Test.createTestingModule({
      imports: [AuthenticationModule],
      providers: [
        {
          provide: GOOGLE_CREDENTIAL_VERIFIER,
          useValue: failingVerifier,
        },
        {
          provide: DATASOURCE,
          useValue: makeMockDataSource(),
        },
      ],
    })
      .overrideProvider(AuthenticationService).useValue(makeFailingAuthenticationService())
      .compile();

    const failApp = failModuleRef.createNestApplication();
    await failApp.init();

    await request(failApp.getHttpServer())
      .post("/authentication/google")
      .set("Origin", ADMIN_ORIGIN)
      .set("X-Transmetro-Request", "admin-web")
      .send({ credential: TEST_CREDENTIAL })
      .expect(503)
      .expect({ error: "AUTHENTICATION_UNAVAILABLE" });

    await failApp.close();
  });

  // --------------------------------------------------------------------------
  // CORS preflight
  // --------------------------------------------------------------------------
  it("OPTIONS /authentication/google returns 204 with CORS headers", async () => {
    await request(app.getHttpServer())
      .options("/authentication/google")
      .set("Origin", ADMIN_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "Content-Type,X-Transmetro-Request")
      .expect(204)
      .expect("Access-Control-Allow-Origin", ADMIN_ORIGIN)
      .expect("Access-Control-Allow-Credentials", "true")
      .expect("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
      .expect("Access-Control-Allow-Headers", "Content-Type,X-Transmetro-Request");
  });

  it("OPTIONS /authentication/google returns 403 for non-allowed origin preflight", async () => {
    await request(app.getHttpServer())
      .options("/authentication/google")
      .set("Origin", FORBIDDEN_ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .expect(403);
  });

  // --------------------------------------------------------------------------
  // Me endpoint
  // --------------------------------------------------------------------------
  it("GET /authentication/me with valid cookie returns 200", async () => {
    const response = await request(app.getHttpServer())
      .get("/authentication/me")
      .set("Origin", ADMIN_ORIGIN)
      .set("Cookie", `__Host-transmetro_admin_session=${TEST_SESSION_HASH}`)
      .expect(200);

    expect(response.body).toMatchObject({
      email: expect.any(String),
      roles: expect.any(Array),
      permissions: expect.any(Array),
    });
  });

  it("GET /authentication/me without cookie returns 401", async () => {
    await request(app.getHttpServer())
      .get("/authentication/me")
      .set("Origin", ADMIN_ORIGIN)
      .expect(401)
      .expect({ error: "AUTHENTICATION_REQUIRED" });
  });

  it("GET /authentication/me with expired cookie returns 401", async () => {
    const expiredHash = "b".repeat(64);
    await request(app.getHttpServer())
      .get("/authentication/me")
      .set("Origin", ADMIN_ORIGIN)
      .set("Cookie", `__Host-transmetro_admin_session=${expiredHash}`)
      .expect(401)
      .expect({ error: "AUTHENTICATION_REQUIRED" });
  });

  // --------------------------------------------------------------------------
  // Logout endpoint
  // --------------------------------------------------------------------------
  it("POST /authentication/logout with valid session returns 204 and clears cookie", async () => {
    const response = await request(app.getHttpServer())
      .post("/authentication/logout")
      .set("Origin", ADMIN_ORIGIN)
      .set("X-Transmetro-Request", "admin-web")
      .set("Cookie", `__Host-transmetro_admin_session=${TEST_SESSION_HASH}`)
      .expect(204);

    expect(response.headers["set-cookie"]).toBeDefined();
    const cookieHeader = response.headers["set-cookie"][0];
    expect(cookieHeader).toContain("__Host-transmetro_admin_session=;");
    expect(cookieHeader).toContain("Max-Age=0");
    expect(cookieHeader).toContain("Path=/");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("Secure");
  });

   it("POST /authentication/logout without cookie returns 204 (idempotent)", async () => {
     await request(app.getHttpServer())
       .post("/authentication/logout")
       .set("Origin", ADMIN_ORIGIN)
       .set("X-Transmetro-Request", "admin-web")
       .expect(204);
   });

   // --------------------------------------------------------------------------
   // Task 3.1 — RED: Guard-protected access, POST-only enforcement, permission denial
   // These tests FAIL until AuthenticationGuard is wired to the controller
   // and @Permissions decorator is enforced.
   // --------------------------------------------------------------------------

    it("GET /authentication/logout returns 404 (POST-only enforced by controller)", async () => {
     await request(app.getHttpServer())
       .get("/authentication/logout")
       .set("Origin", ADMIN_ORIGIN)
       .set("X-Transmetro-Request", "admin-web")
       .set("Cookie", `__Host-transmetro_admin_session=${TEST_SESSION_HASH}`)
       .expect(404);
   });

   it("GET /authentication/me without cookie returns 401 (AuthenticationGuard protects route)", async () => {
     await request(app.getHttpServer())
       .get("/authentication/me")
       .set("Origin", ADMIN_ORIGIN)
       .expect(401)
       .expect({ error: "AUTHENTICATION_REQUIRED" });
   });

   it("GET /authentication/me with invalid session returns 401 (AuthenticationGuard validates session)", async () => {
     await request(app.getHttpServer())
       .get("/authentication/me")
       .set("Origin", ADMIN_ORIGIN)
       .set("Cookie", `__Host-transmetro_admin_session=invalid`)
       .expect(401)
       .expect({ error: "AUTHENTICATION_REQUIRED" });
   });

   it("POST /authentication/logout without X-Transmetro-Request header returns 403", async () => {
     await request(app.getHttpServer())
       .post("/authentication/logout")
       .set("Origin", ADMIN_ORIGIN)
       .set("Cookie", `__Host-transmetro_admin_session=${TEST_SESSION_HASH}`)
       .expect(403)
       .expect({ error: "REQUEST_ORIGIN_DENIED" });
   });
 });
