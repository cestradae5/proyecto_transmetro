# Fix pre-existing apps/api test failures

## Objective
Make `npm test` (and the failing e2e suite) green in `apps/api` on `main`, by adapting specs to the production contract. Production auth code does not change.

## Problem
`npm test` in `apps/api` fails 25 tests across 5 suites on `main` (a6fa616), independent of the fleet work. Baseline: 5 failed / 30 passed suites; 25 failed / 401 passed tests. `authentication.e2e-spec.ts` additionally fails 10 of 16.

## Root causes (verified by diagnosis, not assumed)
1. **`authentication-foundation.spec.ts` (6 tests)** — specs assume a hashed-cookie session contract (`sessionHash` in `LoginResult`, `SessionRepository` injected into `login`, `entityType: "session"`). Production is stateless JWT: `LoginResult {token, expiresAt, usuario}`, `entityType: "jwt"`, no session repository. The specs also build the service with 5 positional args, so `googleVerifier` (4th slot) receives an `AuditRepository`, causing `this.googleVerifier.verify is not a function`.
2. **`authentication.guard.spec.ts` (6 tests) + `security.spec.ts`** — specs pass a `cookie` header and a mock service exposing `me()`. The guard reads `Authorization: Bearer` and calls `authenticationService.verifyToken()`. Also: `SESSION_COOKIE_FLAGS_SECURE/INSECURE` are not exported anywhere in the repo, and ~10 tests are literal `expect(true).toBe(true)` placeholders (green theater, no coverage).
3. **`parada.service.spec.ts` (3) + `estacion.service.spec.ts`** — specs expect `idParada: "1"` (string); the service passes the parsed number `1`. One `remove` case records 0 calls.
4. **`authentication.e2e-spec.ts` (10)** — expects 403s from CORS / `X-Transmetro-Request` enforcement that the controller never implements.

## Why
Every PR touching the api reports red checks unrelated to the change. That destroys signal and trains everyone to ignore failures.

## Decision (user, this session)
**JWT stateless wins; specs adapt to production.** `authentication.service.ts`, `authentication.guard.ts`, `authentication.controller.ts` and `authentication.contracts.ts` MUST NOT change to satisfy these specs.

Un-implemented cookie-session scope, now a documented gap rather than a broken test: `sessionHash` in `LoginResult`, `SessionRepository` used by `login`, the `__Host-transmetro_admin_session` cookie, `SESSION_COOKIE_FLAGS_*` exports, `AuthenticationService.me()`, and CORS / `X-Transmetro-Request` enforcement. Revisit only with a new product decision.

## Scope
- `apps/api/src/**/*.spec.ts`, `apps/api/test/*.e2e-spec.ts` — adapt to the real contract.
- `apps/api/src/**/*.ts` — ONLY if a spec reveals a genuine production defect, called out explicitly and justified. Not expected.
- Out of scope: new coverage beyond what makes existing suites meaningful; changing auth behavior, session policy, or DTO id types.

## Constraints
- Never weaken an assertion to make it green. Placeholder `expect(true)` tests are deleted, not kept.
- Tests whose subject does not exist get removed with a reason recorded here — not silently `it.skip`-ed into invisibility.
- e2e requires `apps/api/.env` loaded in the shell.
- TDD: not configured; runner jest. Ordinary functional checks + `npm run build -w @transmetro/api`.
- Delivery: `ask-on-risk`, ~400 authored changed lines heuristic.

## Tasks
- [x] T1 Diagnose auth spec drift (googleVerifier, guard Bearer contract, RED markers)
- [x] T2 `authentication-foundation.spec.ts`: 4-arg constructor, real `googleVerifier` stub, JWT assertions, drop `sessionHash`/session-repo expectations
- [x] T3 `authentication.guard.spec.ts` + `security.spec.ts`: Bearer + `verifyToken`, drop cookie-extraction blocks, delete `SESSION_COOKIE_FLAGS_*` and `expect(true)` placeholders
- [x] T4 `parada.service.spec.ts` + `estacion.service.spec.ts`: numeric id expectations, fix the 0-call `remove` case
- [ ] T5 `authentication.e2e-spec.ts`: drop un-implemented CORS / `X-Transmetro-Request` expectations, keep and fix real ones
- [ ] T6 Full green run: `npm test`, `npm run test:e2e`, `npm run build -w @transmetro/api`

## Route declaration
- T1: delegated reader (diagnosis), parent verified the decision with the user.
- T2-T5: delegated writer, one commit per task.
- T6: parent verifies, re-runs the baseline comparison.

## Progress / evidence
- Branch: `fix/api-test-failures` (from `main` a6fa616)
- Baseline captured before any change: 5 failed suites / 25 failed tests (unit), 10 of 16 (authentication e2e).
- Baseline exact failing tests (captured by writer, `npm test`):
  - `parada.service.spec.ts` (3): `findOne`, `update`, `remove` soft-delete — expected `"1"`, received `1`.
  - `estacion.service.spec.ts` (1): `findOne` — expected `"1"`, received `1`.
  - `authentication-foundation.spec.ts` (6): all `TypeError: this.googleVerifier.verify is not a function`.
  - `authentication.guard.spec.ts` (6): `UnauthorizedException` instead of allow/`ForbiddenException` (cookie header vs `Bearer`).
  - `security.spec.ts` (9): 6 × `SESSION_COOKIE_FLAGS_*` undefined, 3 × `Unauthorized` instead of `Forbidden`.
- Corroborating prior evidence: `openspec/changes/admin-dashboard/verify-report.md:29` already logged this as "cookie vs JWT-Bearer architecture debt".

### T2 — `authentication-foundation.spec.ts`
- Rewrote the "Session lifecycle transactional contract (RED)" block as
  "Login JWT stateless transactional contract" against the real 4-arg constructor
  `(dataSource, employeeRepo, auditRepo, googleVerifier)`, using the **real**
  `AuditRepository` so `manager.getRepository(AuditLogEntity).save(create(record))`
  is what runs.
- Assertions now on the real contract: `result.token`, `jwt.decode` payload
  (`employeeId/email/roles/permissions/scope`, `exp - iat === 12h`), a
  `service.verifyToken(token)` round trip, audit `entityType: "jwt"` with
  `result: AUDIT_RESULTS.SUCCESS`, and the denial path (`entityRepo` returns
  `null` → `InvalidCredentials` "Credenciales inválidas." + `entityId: "jwt-login"`,
  `result: AUDIT_RESULTS.FAILURE`).
- Removed the dead `SessionEntity` branch from the mock `DataSource`/`getRepository`
  and every `SessionRepository` collaborator from `login` construction.
- Removed: the filler `verified email lookup is case-insensitive` test (old L523-547)
  called `EmployeeRepository.findEligibleByEmail` directly and asserted nothing.
  Replaced by `looks up the employee with the trimmed, uppercased verified email`,
  which asserts the service passes `"USER@TRANSMETRO.GT"` to
  `findEligibleByEmail` — the case-normalization contract that was previously untested.
- Rewritten, not deleted: `session id stored as SHA-256 only, raw token never persists`
  had no subject left (no session row exists). Its intent survives as
  `signs a JWT whose payload carries employee, role, permissions and scope`, whose
  negative assertion is that the issued token never appears in the audit row.
- Kept unchanged (they still hold): the 12h `expiresAt` test, the safe-fields
  negative assertions, and the `SessionRepository`/`AuditRepository` transaction test
  in the first describe block — `SessionRepository` still exists in the repo, so that
  test is not subject-less.
- Evidence:
  - `npm test` → `Test Suites: 4 failed, 31 passed, 35 total` / `Tests: 19 failed, 407 passed, 426 total` (was 5 failed / 25 failed). Exactly the 6 foundation failures cleared.
  - `npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest authentication-foundation` → `Test Suites: 1 passed, 1 total` / `Tests: 22 passed, 22 total`.

### T3 — `authentication.guard.spec.ts` + `security.spec.ts`
- `authentication.guard.spec.ts`: the mock service exposes `verifyToken(token)`
  instead of `me(hash)`, and every context is built with
  `headers: { authorization: "Bearer <token>" }`. Kept the allow/deny and
  `ForbiddenException` assertions — they encode correct behavior — and added the
  `expect(verifyToken).not.toHaveBeenCalled()` guard that proves an unauthenticated
  request never reaches token verification.
- Replaced the `cookie extraction` describe with `Authorization header extraction`,
  preserving both original intents against the header contract: the token is read from
  `Authorization` even when a stale session cookie is present, and a non-`Bearer`
  scheme is rejected before verification.
- `security.spec.ts`: the 3 permission-denial tests moved to
  `verifyToken` + `Bearer` and keep their `ForbiddenException` assertions.
- **17 tests deleted, each with its reason:**
  1. `sets __Host-transmetro_admin_session with HttpOnly flag (HTTPS/production)` —
     `SESSION_COOKIE_FLAGS_SECURE` is not exported anywhere; no cookie is ever set.
  2. `... with Secure flag (HTTPS/production)` — same.
  3. `... with SameSite=None (HTTPS/production)` — same.
  4. `... with Path=/ (HTTPS/production)` — same.
  5. `... with Max-Age=43200 (12 hours)` — same.
  6. `uses plain cookie name without __Host- prefix for HTTP dev` —
     `SESSION_COOKIE_FLAGS_INSECURE` is not exported anywhere.
  7. `Trusted Origin validation > rejects requests with untrusted Origin header` —
     self-admittedly inert: instantiated the controller and asserted
     `expect(controller).toBeDefined()`, with a comment admitting `isOriginAllowed`
     is private and never called. No subject, no assertion.
  8. `Trusted Origin validation > rejects requests with missing Origin header` —
     `expect(true).toBe(true)` placeholder.
  9. `Trusted Origin validation > rejects requests with null Origin header` —
     `expect(true).toBe(true)` placeholder.
  10. `Required X-Transmetro-Request header > rejects login without X-Transmetro-Request header` — `expect(true).toBe(true)` placeholder.
  11. `... rejects login with wrong X-Transmetro-Request value` — `expect(true).toBe(true)` placeholder.
  12. `... rejects logout without X-Transmetro-Request header` — `expect(true).toBe(true)` placeholder.
  13. `... requires X-Transmetro-Request: admin-web for login` — `expect(true).toBe(true)` placeholder.
  14. `POST-only logout endpoint > rejects GET /authentication/logout` — `expect(true).toBe(true)` placeholder. The real behavior stays covered by the e2e suite's `GET /authentication/logout returns 404`.
  15. `... rejects DELETE /authentication/logout` — `expect(true).toBe(true)` placeholder.
  16. `... rejects PUT /authentication/logout` — `expect(true).toBe(true)` placeholder.
  17. `... accepts only POST /authentication/logout` — `expect(true).toBe(true)` placeholder.
- Retitled `Exact CORS policy (task 1.2)` → `Admin web origin configuration` and
  documented at the top of the file that these 4 tests cover origin *configuration
  parsing*, not HTTP CORS enforcement, which does not exist.
- Known gap left in place (not added, per the "no new coverage" constraint): the
  guard's non-`Bearer`-scheme rejection is now covered, but there is no test for
  `@Permissions` requiring **multiple** permissions where only some are held.
- Evidence:
  - `npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest authentication.guard security` → `Test Suites: 2 passed, 2 total` / `Tests: 16 passed, 16 total`.
  - `npm test` → `Test Suites: 2 failed, 33 passed, 35 total` / `Tests: 4 failed, 405 passed, 409 total` (was 4 failed / 19 failed). Suite count for this pair is now 0 failed.

### T4 — `parada.service.spec.ts` + `estacion.service.spec.ts`
**Investigation of the `remove` case that recorded 0 calls — no production defect.**
`ParadaService.remove(id, force = false)` (`src/infrastructure/parada/parada.service.ts:43-52`)
soft-deletes by loading the entity, assigning `parada.estadoParada = EstadoParada.CERRADA`,
and persisting it with `this.paradaRepository.save(parada)`. It never calls
`paradaRepository.update(...)` and never calls `paradaRepository.remove(...)` on the
soft path. The spec asserted `repository.update` had been called, so the count was 0.
The *intent* of the test — "soft-deletes by setting estadoParada to CERRADA when force
is false" — is exactly what production does; only the asserted persistence mechanism was
wrong. Not a defect, so no production change.
- `findOne` / `update`: the service parses the route id with `Number(id)` because
  `id_parada` is a `bigint` column. Specs expected the raw string `"1"`; corrected to `1`.
- `remove` soft-delete: now asserts `repository.save` received the loaded entity with
  `estadoParada: CERRADA`, and that **neither** `update` nor `remove` was called — the
  hard-delete path is now also pinned by asserting `save` is not called when `force` is true.
- `estacion.service.spec.ts`: same `Number(id)` correction for `findOne`
  (`{ where: { idEstacion: 1 } }`).
- No tests deleted in this task; none had a missing subject or an empty assertion.
- Evidence:
  - `npm test` → `Test Suites: 35 passed, 35 total` / `Tests: 409 passed, 409 total`, exit code 0.
  - Unit baseline was `5 failed suites / 25 failed tests / 401 passed`; now `0 / 0 / 409`.
    Total test count dropped 426 → 409 purely from the 17 deliberate deletions in T3.

### Documented gaps (not defects, not implemented scope)
- **Cookie-session design is entirely absent from production**: no `sessionHash` in
  `LoginResult`, no `SessionRepository` use in `login`, no
  `__Host-transmetro_admin_session` cookie, and `SESSION_COOKIE_FLAGS_SECURE` /
  `SESSION_COOKIE_FLAGS_INSECURE` are **not exported anywhere in the repo**
  (verified by reading `authentication.controller.ts` in full — it exports only the
  controller class). Tests importing them are deleted, not skipped.
- `AuthenticationService` has no `me()`; the guard calls `verifyToken()`.
- The controller implements **no CORS and no `X-Transmetro-Request` / Origin
  enforcement**. `readAuthenticationEnvironment()` still validates the
  `ADMIN_WEB_ORIGINS` *configuration value* (exact http/https origins, no wildcard);
  that parsing is covered, HTTP enforcement is not implemented.

## Next step
T5.
