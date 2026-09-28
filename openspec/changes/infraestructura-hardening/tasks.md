# Tasks: Infrastructure Hardening (Seguridad y Cobertura de Pruebas)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1200–1500 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Permissions) → PR 2 (Backend Tests) → PR 3 (Junction + Close) → PR 4 (Frontend Tests + README) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

**Decision needed before apply**: Yes
**Chained PRs recommended**: Yes
**Chain strategy**: pending (stacked-to-main | feature-branch-chain — requires user choice)
**400-line budget risk**: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Add @Permissions decorators to all 5 controllers; enhance protected-route.tsx for module check | PR 1 | `npm test -w apps/api -- parada.controller` + `npm test -w apps/admin-web -- protected-route.spec` | Real DB seed with INFRAESTRUCTURA_GESTIONAR user, call POST /infrastructure/paradas from both auth'd (expect 201) and unauth'd (expect 403) clients | Files: parada.controller.ts, estacion.controller.ts, parqueo.controller.ts, linea.controller.ts, afectacion.controller.ts, protected-route.tsx — revert decorators and route guard separately; app.tsx routes unchanged |
| 2 | Write unit + integration tests for Parada, Estacion, Parqueo services/controllers (≥80% service, ≥70% controller) | PR 2 | `npm test -w apps/api -- infrastructure --coverage` | `npm run test:integration -w apps/api -- parada` (real test DB, transactional) | Files under apps/api/src/infrastructure/{parada,estacion,parqueo}/__tests__/; delete to revert |
| 3 | Implement Línea junction methods (addParada, updateParadaOrder, removeParada) + controller endpoints + Afectación close() method + tests | PR 3 | `npm test -w apps/api -- linea --coverage` + `npm test -w apps/api -- afectacion --coverage` | Real DB with >2 paradas in línea; call POST /infrastructure/lineas/{id}/paradas (201), PATCH (200), DELETE (204 or 409 on <2 remain); test close endpoint | Files: linea.service.ts, linea.controller.ts, afectacion.service.ts, afectacion.controller.ts, and their __tests__/ subdirs; revert methods/endpoints separately |
| 4 | Write frontend component tests for 5 dialog/form pairs (parada-form, estacion-form, etc.) + README documentation | PR 4 | `npm test -w apps/admin-web -- infrastructure --coverage` | Render InfrastructurePageTabs in test harness, simulate form submit, verify dialog close, list re-fetch | Files: apps/admin-web/src/features/infrastructure/**/__tests__/ and apps/api/src/infrastructure/README.md; delete test files and README to revert |

---

## Phase 1: Permission Enforcement (Backend + Frontend)

**Goal**: Lock down all infrastructure endpoints and routes. This is the security-critical foundation; must ship first.

- [x] 1.1 Verify `@Permissions('INFRAESTRUCTURA_GESTIONAR')` decorator exists in `apps/api/src/authentication/permissions.decorator.ts` and is wired into `AuthenticationGuard` (lines 56–69). If not, implement the decorator and wire it.
- [x] 1.2 Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` class-level or method-level decorator to `apps/api/src/infrastructure/parada/parada.controller.ts` — apply to all 5 endpoints (CREATE, READ, READ_ONE, UPDATE, DELETE)
- [x] 1.3 Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` to `apps/api/src/infrastructure/estacion/estacion.controller.ts` — all 5 endpoints
- [x] 1.4 Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` to `apps/api/src/infrastructure/parqueo/parqueo.controller.ts` — all 5 endpoints
- [x] 1.5 Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` to `apps/api/src/infrastructure/linea/linea.controller.ts` — all 5 endpoints (GET/POST/PATCH/DELETE lineas)
- [x] 1.6 Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` to `apps/api/src/infrastructure/afectacion/afectacion.controller.ts` — all 5 endpoints
- [x] 1.7 Create simple manual test: Start backend, call `POST /infrastructure/paradas` without auth token → expect 401; call without `INFRAESTRUCTURA_GESTIONAR` permission → expect 403; call with permission → expect 201. Verify decorators are working. *(Done as a static code-path trace instead of a live server call — see apply-progress for the trace and the pre-existing auth.guard.spec.ts drift that blocks a live run.)*
- [x] 1.8 Enhance `apps/admin-web/src/features/dashboard/protected-route.tsx` to check `user.scope.modules` in addition to `isAuthenticated`. If user lacks the required module, redirect to `/landing`.
- [x] 1.9 Update the `/infrastructure` route in `apps/admin-web/src/app.tsx` to use the enhanced protected-route guard (or pass a `requiredModule="infrastructure"` prop if the component supports parameterized modules). Verify other protected routes (/profile, /landing) still work.
- [x] 1.10 Manual test on frontend: Log in as user WITHOUT `'infrastructure'` in `user.scope.modules` → navigate to `/infrastructure` → should redirect to `/landing`. Log in as user WITH module → should load InfrastructurePageTabs. *(Done as a static code-path trace — see apply-progress.)*

---

## Phase 2: Backend Service & Controller Tests for Parada, Estacion, Parqueo

**Goal**: Establish test patterns and achieve ≥80% service coverage, ≥70% controller coverage for the 3 simple entities. These tests verify permission guards, validation, error handling, and FK constraints before more complex junction logic.

### Parada Tests

- [ ] 2.1 Create `apps/api/src/infrastructure/parada/__tests__/parada.service.spec.ts` with Jest + mocked `ParadaRepository`
  - Test successful creation with valid nombre, latitud, longitud, estado
  - Test FK validation: creation fails if estado not in enum (ACTIVA|CERRADA|MANTENIMIENTO)
  - Test coordinate bounds: latitud ±90, longitud ±180 (reject 91, 181, -91, -181)
  - Test nombre uniqueness: two paradas with same nombre → second fails with 400/409
  - Test 404 on get non-existent parada
  - Test 409 on update non-existent parada
  - Test successful update of nombre/latitud/longitud/estado
  - Test successful soft-delete (estado→CERRADA)
- [ ] 2.2 Create `apps/api/src/infrastructure/parada/__tests__/parada.controller.spec.ts` with Jest + mocked `ParadaService`
  - Verify `@Permissions('INFRAESTRUCTURA_GESTIONAR')` decorator is present (inspect metadata)
  - Test POST / returns 201 with ParadaResponseDto on success
  - Test POST / returns 400 on validation error (bad coordinates, missing nombre)
  - Test POST / returns 400 on duplicate nombre
  - Test GET / with pagination (page=1&limit=10) returns 200 with array + pagination metadata
  - Test GET / with filter (estado=ACTIVA) returns filtered results
  - Test GET /:id returns 200 with complete ParadaResponseDto
  - Test GET /:id returns 404 on non-existent id
  - Test PATCH /:id returns 200 on update
  - Test PATCH /:id returns 400 on bad data (invalid coordinates)
  - Test PATCH /:id returns 404 on non-existent id
  - Test DELETE /:id returns 204 on success
  - Test DELETE /:id returns 404 on non-existent id
- [ ] 2.3 Create `apps/api/test/infrastructure/parada.integration.spec.ts` (real test database, TypeORM transactional rollback)
  - Seed test database with 1 parada (ACTIVA)
  - Test full CRUD cycle: create new parada (INSERT), read it (SELECT), update its nombre, read again, soft-delete (estado→CERRADA), read again
  - Verify DB sequences/id assignment works
  - Verify unique constraint on nombre is enforced at DB level (attempt to insert duplicate via direct SQL → fails)
  - Verify FK (estado enum) is enforced at DB level
  - Verify transactional rollback: after test, parada count returns to 1
  - Target ≥80% line coverage for parada.service.ts

### Estacion Tests

- [ ] 2.4 Create `apps/api/src/infrastructure/estacion/__tests__/estacion.service.spec.ts` (mocked repository)
  - Test successful creation with nombre, tipo_punto (enum: TERMINAL|INTERMEDIA|PARADA_CENTRAL)
  - Test nombre uniqueness constraint
  - Test tipo_punto enum validation
  - Test 404/409 on update/delete non-existent
  - Test successful update of nombre/tipo_punto
- [ ] 2.5 Create `apps/api/src/infrastructure/estacion/__tests__/estacion.controller.spec.ts`
  - Verify `@Permissions` decorator present
  - Test POST / 201 success, 400 on bad tipo_punto, 400 on duplicate nombre
  - Test GET / with pagination and tipo_punto filter
  - Test GET /:id 200/404
  - Test PATCH /:id 200/400/404
  - Test DELETE /:id 204/404

### Parqueo Tests

- [ ] 2.6 Create `apps/api/src/infrastructure/parqueo/__tests__/parqueo.service.spec.ts` (mocked repository)
  - Test successful creation with nombre, numero_parqueo (unique)
  - Test numero_parqueo uniqueness
  - Test 404/409 on update/delete non-existent
  - Test successful update
- [ ] 2.7 Create `apps/api/src/infrastructure/parqueo/__tests__/parqueo.controller.spec.ts`
  - Verify `@Permissions` decorator present
  - Test POST / 201/400/409 (numero_parqueo duplicate)
  - Test GET / with pagination
  - Test GET /:id 200/404
  - Test PATCH /:id 200/400/404
  - Test DELETE /:id 204/404

---

## Phase 3: Línea Junction Logic & Afectación Close Method (Backend)

**Goal**: Implement and test the remaining business logic for Línea↔Parada relationships and Afectación state transitions. These are domain-specific and require careful validation of constraints (≥2 paradas, orden uniqueness).

### Línea Service Junction Methods

- [ ] 3.1 Implement `addParada(lineaId: number, paradaId: number, orden: number, minutosHastaSiguiente: number)` in `apps/api/src/infrastructure/linea/linea.service.ts`
  - Validate lineaId exists (FK check)
  - Validate paradaId exists (FK check)
  - Validate orden > 0
  - Validate minutos ≥ 0
  - Validate orden is unique per línea (no duplicate orden in tbl_linea_parada for this lineaId)
  - Create new tbl_linea_parada row with FK constraints
  - Return created record with 201 status
  - On constraint violation (orden duplicate, FK missing), throw appropriate exception (400/409)
- [ ] 3.2 Implement `updateParadaOrder(lineaId: number, lineaParadaId: number, nuevoOrden: number, minutosHastaSiguiente: number)` in linea.service.ts
  - Validate lineaId and lineaParadaId exist
  - Validate nuevoOrden > 0
  - Validate nuevoOrden is unique per línea (excluding the current record)
  - Update tbl_linea_parada.orden and tbl_linea_parada.minutos_hasta_siguiente
  - Return updated record with 200 status
  - On duplicate orden, throw 409 Conflict
- [ ] 3.3 Implement `removeParada(lineaId: number, lineaParadaId: number)` in linea.service.ts
  - Validate lineaId and lineaParadaId exist
  - Count remaining paradas for this lineaId
  - If count ≤ 2 (would leave <2 after delete), throw 409 Conflict with `LINEA_MIN_PARADAS`
  - If count > 2, delete the tbl_linea_parada row
  - Return 204 No Content on success
- [ ] 3.4 Create `apps/api/src/infrastructure/linea/__tests__/linea.service.spec.ts` (mocked repository) — focus on junction methods
  - Test addParada: success case (3 paradas, add 4th), 400 on invalid FK, 409 on duplicate orden
  - Test updateParadaOrder: success case, 409 on duplicate orden, 404 on invalid lineaParadaId
  - Test removeParada: success with 3→2, fail with 2→1 (throw LINEA_MIN_PARADAS), 404 on invalid lineaParadaId
  - Target ≥80% coverage for junction-related code
- [ ] 3.5 Create `apps/api/src/infrastructure/linea/__tests__/linea.controller.spec.ts` (mocked service)
  - Verify `@Permissions` decorator on main GET/POST/PATCH/DELETE lineas endpoints
  - Test POST /infrastructure/lineas 201/400/403
  - Test POST /infrastructure/lineas/:id/paradas 201/400/409/403 (permission guard)
  - Test PATCH /infrastructure/lineas/:id/paradas/:lineaParadaId 200/400/404/409/403
  - Test DELETE /infrastructure/lineas/:id/paradas/:lineaParadaId 204/400/404/409/403

### Línea Controller Junction Endpoints

- [ ] 3.6 Add `POST /infrastructure/lineas/:id/paradas` endpoint to `apps/api/src/infrastructure/linea/linea.controller.ts`
  - Accept body: `{ id_parada: number, orden: number, minutos_hasta_siguiente: number }`
  - Call `this.lineaService.addParada(id, id_parada, orden, minutos_hasta_siguiente)`
  - Return 201 with created tbl_linea_parada DTO
  - On 400/409, return appropriate error response
  - Guard: `@Permissions('INFRAESTRUCTURA_GESTIONAR')`
- [ ] 3.7 Add `PATCH /infrastructure/lineas/:id/paradas/:lineaParadaId` endpoint to linea.controller.ts
  - Accept body: `{ orden?: number, minutos_hasta_siguiente?: number }`
  - Call `this.lineaService.updateParadaOrder(id, lineaParadaId, orden, minutos_hasta_siguiente)`
  - Return 200 with updated DTO
  - Guard: `@Permissions('INFRAESTRUCTURA_GESTIONAR')`
- [ ] 3.8 Add `DELETE /infrastructure/lineas/:id/paradas/:lineaParadaId` endpoint to linea.controller.ts
  - Call `this.lineaService.removeParada(id, lineaParadaId)`
  - Return 204 No Content on success
  - On 409, return error (LINEA_MIN_PARADAS)
  - Guard: `@Permissions('INFRAESTRUCTURA_GESTIONAR')`

### Afectación Close Method

- [ ] 3.9 Implement `close(afectacionId: number)` in `apps/api/src/infrastructure/afectacion/afectacion.service.ts`
  - Validate afectacionId exists
  - Fetch afectación record
  - Set estado = 'CERRADA'
  - Set fecha_fin = current timestamp (now())
  - Save to database
  - Return updated AfectacionResponseDto with 200 status
  - If afectacionId not found, throw 404
- [ ] 3.10 Create `apps/api/src/infrastructure/afectacion/__tests__/afectacion.service.spec.ts` (mocked repository)
  - Test successful close: estado transitions from ABIERTA→CERRADA, fecha_fin set
  - Test 404 on close non-existent afectacion
  - Test that other fields (descripcion, etc.) remain unchanged
- [ ] 3.11 Create `apps/api/src/infrastructure/afectacion/__tests__/afectacion.controller.spec.ts` (mocked service)
  - Verify `@Permissions` decorator on all endpoints
  - Test main CRUD: POST 201/400/403, GET 200/404, PATCH 200/400/404/403, DELETE 204/404/403
  - Test POST /infrastructure/afectaciones/:id/close 200/404/403

### Afectación Controller Close Endpoint

- [ ] 3.12 Add `PATCH /infrastructure/afectaciones/:id/close` endpoint to `apps/api/src/infrastructure/afectacion/afectacion.controller.ts`
  - Call `this.afectacionService.close(id)`
  - Return 200 with updated AfectacionResponseDto
  - If id not found, return 404
  - Guard: `@Permissions('INFRAESTRUCTURA_GESTIONAR')`

### Integration Test for Línea Junction

- [ ] 3.13 Create `apps/api/test/infrastructure/linea.integration.spec.ts` (real test database)
  - Seed: 1 línea (numero_linea="1", estado="ACTIVA"), 3 paradas
  - Test POST /infrastructure/lineas/:id/paradas to add parada 1 with orden=1
  - Test POST again with parada 2, orden=2
  - Verify 2 rows in tbl_linea_parada
  - Test PATCH to update orden or minutos
  - Test DELETE to remove 1 parada (should succeed with 2 remaining)
  - Test DELETE again on the last remaining parada (should fail 409)
  - Verify transactional rollback: after test, tbl_linea_parada count returns to 0
  - Target ≥80% coverage for linea.service.ts

---

## Phase 4: Frontend Component Tests & Documentation

**Goal**: Establish test patterns for frontend forms, verify permission-based redirect behavior, document API contracts. Frontend UI for junction management (e.g., LineaParadaTable component) is explicitly OUT of scope — flag as follow-up.

### Frontend Component Tests

- [ ] 4.1 Create `apps/admin-web/src/features/infrastructure/parada/__tests__/parada-form.spec.tsx` (Vitest + Testing Library)
  - Test form renders with input fields (nombre, latitud, longitud, estado)
  - Test form submission on valid data → calls `onSubmit` callback with form data
  - Test form shows validation errors on invalid coordinate ranges
  - Test form shows validation error on empty required fields
  - Test error state render (e.g., API error response)
  - Target ≥70% coverage for parada-form.tsx
- [ ] 4.2 Create `apps/admin-web/src/features/infrastructure/parada/__tests__/paradas-list.spec.tsx`
  - Test list renders with mock parada data
  - Test pagination controls (prev/next, page number)
  - Test filter by estado dropdown changes list output
  - Test clicking "Edit" or "Delete" button triggers expected callback
  - Test "Create" button opens form dialog
  - Target ≥70% coverage for paradas-list.tsx
- [ ] 4.3 Create `apps/admin-web/src/features/infrastructure/estacion/__tests__/estacion-form.spec.tsx` (same pattern as parada-form)
  - Test form renders (nombre, tipo_punto select)
  - Test submission success/error
  - Test validation for required fields and tipo_punto enum
- [ ] 4.4 Create `apps/admin-web/src/features/infrastructure/estacion/__tests__/estaciones-list.spec.tsx` (same pattern as paradas-list)
- [ ] 4.5 Create `apps/admin-web/src/features/infrastructure/parqueo/__tests__/parqueo-form.spec.tsx`
- [ ] 4.6 Create `apps/admin-web/src/features/infrastructure/parqueo/__tests__/parqueos-list.spec.tsx`
- [ ] 4.7 Create `apps/admin-web/src/features/infrastructure/linea/__tests__/linea-form.spec.tsx`
  - Test form renders (numero_linea, nombre, color_hex, estado_linea, tipo_recorrido, id_parqueo)
  - Test color_hex validation (must match #RRGGBB format)
  - Test parqueo FK dropdown populated
  - Test submission success/error
- [ ] 4.8 Create `apps/admin-web/src/features/infrastructure/linea/__tests__/lineas-list.spec.tsx`
- [ ] 4.9 Create `apps/admin-web/src/features/infrastructure/afectacion/__tests__/afectacion-form.spec.tsx`
  - Test form renders (descripcion, linea/parada/estacion selectors, estado enum)
  - Test validation on required fields
  - Test submission and error handling
- [ ] 4.10 Create `apps/admin-web/src/features/infrastructure/afectacion/__tests__/afectaciones-list.spec.tsx`
- [ ] 4.11 Create `apps/admin-web/src/features/dashboard/__tests__/protected-route.spec.tsx`
  - Test ProtectedRoute renders child when `isAuthenticated=true` and required module is in `user.scope.modules`
  - Test ProtectedRoute redirects to `/landing` when `isAuthenticated=true` but required module is NOT in `user.scope.modules`
  - Test ProtectedRoute redirects to `/login` when `isAuthenticated=false`
  - Target ≥70% coverage for protected-route.tsx

### Documentation

- [ ] 4.12 Create `apps/api/src/infrastructure/README.md` documenting:
  - **Module Purpose**: Overview of the infrastructure module (5 entities, CRUD operations, permission requirements)
  - **Endpoints**: Table of all 20+ endpoints (5 base CRUD × 5 entities, plus junction/close methods) with method, path, required permission, response codes
  - **Error Codes**: Map of business error codes (PARADA_NAME_DUPLICATE, ORDEN_DUPLICATE, LINEA_MIN_PARADAS, PARQUEO_NOT_FOUND, etc.) to HTTP status and description
  - **Permission Requirements**: All endpoints require `INFRAESTRUCTURA_GESTIONAR` permission (403 if missing)
  - **DTOs**: Request/response schema for each entity (ParadaRequestDto, ParadaResponseDto, etc.)
  - **Pagination**: Query params (page, limit), response metadata (total, page, hasMore)
  - **FK Validation**: Description of foreign key checks (parada.estado must be in enum, linea.id_parqueo must exist, etc.)
  - **Database**: Brief mention of tables (tbl_parada, tbl_estacion, tbl_parqueo, tbl_linea, tbl_afectacion, tbl_linea_parada)
  - **Example Flows**: JSON examples for POST create parada, PATCH update linea nombre, DELETE parada

---

## Phase 5: Verification & Chained PR Coordination

**Goal**: Verify all tasks are complete, all tests pass, and no 400-line budget overruns. Confirm chain strategy before apply (required by delivery_strategy=ask-on-risk).

- [ ] 5.1 Run `npm test -w apps/api -- --coverage` and capture final coverage report for infrastructure module (target: services ≥80%, controllers ≥70%)
- [ ] 5.2 Run `npm test -w apps/admin-web -- --coverage` and capture coverage for infrastructure features (target: ≥70%)
- [ ] 5.3 Run `npm run test:integration -w apps/api` to verify integration tests pass against real test database
- [ ] 5.4 Manually verify backend: Start server, call infrastructure endpoints with/without permission, verify 403 on missing `INFRAESTRUCTURA_GESTIONAR`
- [ ] 5.5 Manually verify frontend: Log in as user with and without `'infrastructure'` module, verify redirect behavior on protected-route
- [ ] 5.6 Document actual changed-line counts for each work unit (PR 1, PR 2, PR 3, PR 4) — if any exceed 400 lines, escalate to orchestrator with revised chain strategy
- [ ] 5.7 Verify all new test files are discoverable by Jest (apps/api) and Vitest (apps/admin-web) test runners
- [ ] 5.8 Confirm Swagger documentation auto-generates endpoints with permission metadata visible (if applicable)
- [ ] 5.9 Before submitting PRs: review this tasks.md one final time against proposal + preflight clarifications. Ensure no scope creep (e.g., frontend LineaParadaTable UI is explicitly OUT of scope).

---

## Notes

- **API Route Prefix**: Per preflight clarification, use `/infrastructure/...` WITHOUT `/api` prefix (matches current codebase). Do NOT add `/api` prefix to routes.
- **Frontend Junction UI**: Línea↔Parada junction management UI (e.g., LineaParadaTable, drag-drop reordering) is OUT of scope for this change. Backend endpoints are implemented; frontend wiring is flagged as a follow-up task.
- **Chain Strategy Decision**: This task list recommends a 4-PR chain (Permissions → Service/Controller Tests → Junction+Close → Frontend Tests+Docs). The specific chain strategy (stacked-to-main vs feature-branch-chain) requires user input per delivery_strategy=ask-on-risk.
- **Coverage Targets**: Service ≥80%, Controller ≥70%, Frontend ≥70% are best-effort targets, not hard gates. If a component falls slightly below, document the reason and justify before shipping.
- **Soft-Delete**: Parada uses estado='CERRADA' for soft-delete (not INACTIVA), per existing DB schema and prior decisions. Línea and other entities follow their own soft-delete semantics.
- **Test Patterns**: Follow existing patterns in the codebase:
  - Backend: Jest + mocked repos (*.spec.ts), TypeORM + transactional rollback (*.integration-spec.ts)
  - Frontend: Vitest + Testing Library (*.spec.tsx)
- **Decorator Verification**: Task 1.1 verifies that `@Permissions` decorator exists. If it doesn't, implement before decorating controllers. The decorator must be wired into `AuthenticationGuard` (authentication.guard.ts:56–69).
