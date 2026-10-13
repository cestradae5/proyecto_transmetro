# Bitácora completion (100% usabilidad)

Branch: `feat/bitacora-completion` (from `origin/main` @ 3c75201).
Goal: close the REQ-FUNC-012 audit gaps so the bitácora is usable end-to-end: every
Infrastructure mutation writes a `tbl_bitacora` row, and a failed login leaves a record
without crashing. The read-only viewer already exists (PR #72).

## Specs
- S1 (REQ-FUNC-012, verbatim): "El sistema debe registrar en una bitácora las acciones
  administrativas realizadas por los usuarios internos para permitir trazabilidad de
  cambios y accesos." Acceptance (verbatim): "Las modificaciones de infraestructura,
  flota, personal, roles y avisos quedan registradas." Infra is the open gap.
- S2: Every create/update/delete in each Infrastructure submodule writes exactly one
  `tbl_bitacora` row inside the SAME transaction as the write (fleet/personal precedent):
  `modulo="infrastructure"` (English value, like fleet/personal; admin-web MODULE_LABELS maps it to "Infraestructura"), a submodule-specific `accion` and `entidad_tipo`,
  `resultado="EXITOSO"`, `id_empleado=actor`, `entidad_id=<affected row bigint id>`,
  `detalle` = a non-PII summary of what changed. A rejected mutation (validation/404/409)
  writes NO row.
- S3: The actor is the authenticated user, read from `request.user.employeeId` set by
  `AuthenticationGuard` (never a route/body param), threaded controller -> service, exactly
  like fleet/personal.
- S4: Submodules in scope: `municipalidad` (+ `linea-municipalidad` junction), `acceso`,
  `parqueo`, `parada`, `estacion` (+ `estacion-linea` junction), `linea` (+ `linea-parada`
  sequence). `afectacion` if it exposes mutations. For composite-PK junctions, `entidad_id`
  is the parent línea id (fleet precedent: entidad_id is the owning aggregate's id).
- S5 (user decision, verbatim): "Solo que gaurde el error de login fallido, no es necesario
  que gaurde el usuario o correo solo que existio un login fallido." A failed login records
  one row: `modulo="authentication"`, `accion="LOGIN"`, `resultado="FALLIDO"`, no employee,
  no attempted email in `detalle`. It must NOT crash the request; the endpoint still
  returns the clean 401 (`InvalidCredentials`). Successful login behaviour is unchanged.
- S6: `tbl_bitacora.id_empleado` and `tbl_bitacora.entidad_id` become nullable so the
  failed-login row (no employee, no entity) can be stored; `database/init.sql` updated.
- S7: The viewer (`GET /audit-log`) uses a LEFT JOIN on `tbl_empleado`; `employee` in the
  response item becomes nullable; `entityId` becomes nullable. The admin-web table and
  detail dialog render a null employee as "Sistema" (or "—") without breaking. Null-employee
  rows simply won't match a user text filter (expected).

## Tasks
- [x] T1  Shared infra audit helper + constants in `infrastructure/shared/` (DataSource + AuditRepository, writes inside caller tx). Route: inline. Commit: feat(api) infra audit foundation.
- [x] T2  `municipalidad` create/update/delete audit + actor threading + tests. Commit: feat(api).
- [x] T3  `acceso` audit + actor + tests. Commit: feat(api).
- [x] T4  `parqueo` audit + actor + tests. Commit: feat(api).
- [x] T5  `parada` audit + actor + tests. Commit: feat(api).
- [x] T6  `estacion` (+ `estacion-linea`) audit + actor + tests. Commit: feat(api).
- [x] T7  `linea` (+ `linea-parada`) audit + actor + tests. Commit: feat(api).
- [x] T8  `afectacion` audit + actor + tests (if it has mutations). Commit: feat(api).
- [x] T9  Schema: id_empleado + entidad_id nullable in `database/init.sql` (S6). Commit: feat(db).
- [ ] T10 Failed-login records FALLIDO row without crashing, returns 401 (S5). Test-first. Commit: fix(api).
- [ ] T11 Viewer LEFT JOIN + nullable employee/entityId in DTO/service + update viewer unit/e2e specs (S7). Commit: feat(api).
- [ ] T12 admin-web: render null employee as "Sistema"/"—" in table + detail dialog + tests (S7). Commit: feat(admin-web).
- [ ] T13 Full verification (api jest, web vitest, api tsc, web tsc, DB-backed e2e) + independent verifier for schema/contract (S6/S7).

## Progress / evidence
- T1: added `infrastructure/shared/infrastructure-audit.{constants,service,service.spec}.ts`; registered `InfrastructureAuditService` provider in `InfrastructureModule` (AuditRepository is exported by AuthenticationModule, already imported). Test-first: `npm test -- infrastructure-audit.service` 2/2; `tsc -p tsconfig.build.json --noEmit` exit 0.

- T2: municipalidad create/update/remove and linea-municipalidad add(LINK)/remove(UNLINK) now write audit inside `repo.manager.transaction`; actor threaded controller->service via `request.user.employeeId`. Reference pattern for T3-T8. Test-first: `npm test -- municipalidad` 4 suites / 52; `tsc -p tsconfig.build.json --noEmit` exit 0. Commit pending.

- T3: acceso create/update/remove audited (CREATE/UPDATE/REMOVE, entityType acceso, entityId=String(accesoId)) inside transaction; actor threaded. `npm test -- acceso` 2 suites / 33; tsc exit 0.

- T4: parqueo create/update/remove audited inside transaction; actor threaded. `npm test -- parqueo` 2 suites / 19; tsc exit 0.

- T5: parada create/update/remove (soft+force) audited inside transaction; entityId=String(numeric id); actor threaded (controller remove sig now id,request,force?). `npm test -- parada` 2 suites / 25; tsc exit 0.

- T6: estacion create/update/remove(soft+force, FK->409 preserved) and estacion-linea add(LINK)/update/remove(UNLINK) audited inside transaction; entityId=estacion id; actor threaded. `npm test -- estacion` 9 suites / 80; tsc exit 0.

- T7: linea create/update/remove + addParada(LINK)/updateParada/removeParada(UNLINK)/reorderParadas(REORDER) audited; reorder audits inside its existing transaction only when paradas exist; actor threaded on all 7 endpoints. `npm test -- linea/linea` 2 suites / 71; tsc exit 0.

- T8: afectacion create/update/close(UPDATE)/remove audited inside transaction; actor threaded. `npm test -- afectacion` 2 suites / 33.
- Infra auditing complete (T1-T8). Full api `npm test` 65 suites / 738 passed; `tsc -p tsconfig.build.json --noEmit` exit 0.

- T9: `database/init.sql` tbl_bitacora -> `entidad_id BIGINT` and `id_empleado BIGINT` now nullable (DDL; existing NOT NULL inserts unaffected). Enables the minimal failed-login row (S6). Entity/repository nullability + viewer land in T10/T11.

## Log
- L1 (user request, verbatim): "Hola necesito que me ayudes a terminar la bitacora al 100% de usabilidad"
- L2 (user decision): scope = (1) Auditar CRUD de Infraestructura, (2) Corregir auditoría de login fallido.
- L3 (user decision, failed login): see S5 verbatim — only record that a failed login happened, no user/email.
- L4 (git): branched `feat/bitacora-completion` from `origin/main` @ 3c75201; prior `feat/administrative-reports` WIP stashed (`stash@{0}`).
