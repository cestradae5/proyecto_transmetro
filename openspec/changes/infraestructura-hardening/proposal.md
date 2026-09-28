# Proposal: Infrastructure Hardening (Seguridad y Cobertura de Pruebas)

## Intent

The `infraestructura` module shipped a working full-stack CRUD implementation for 5 transit entities (Parada, Estación, Parqueo, Línea, Afectación) but diverged significantly from its 105-task plan. This follow-up change closes the **highest-value functional and security gaps** without re-litigating architecture decisions already approved and deployed.

**Primary driver**: Permission enforcement is completely absent from the backend API and insufficiently guarded on the frontend. Any authenticated employee (any role) can directly call infrastructure endpoints or navigate to `/infrastructure`, regardless of whether they have the `INFRAESTRUCTURA_GESTIONAR` permission. This is a **critical security gap** that must ship.

**Secondary drivers**: Zero test coverage (services, controllers, frontend components) means changes risk silent regressions. Línea↔Parada junction table logic remains unimplemented despite being in the original scope. Afectación lacks a dedicated close() method for state transitions.

## Scope

### In Scope

**CRITICAL (must ship)**
- Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` decorator to all 5 infrastructure controller endpoints (Parada, Estación, Parqueo, Línea, Afectación) or apply at controller-level decorator to enforce permission checks consistently
- Add module-level route guard to frontend `/infrastructure` route: redirect to `/landing` if `'infrastructure'` not in `user.scope.modules`, mirroring the guard pattern used in other protected modules
- Verify and document that `AuthenticationGuard` (protected-route.tsx) is sufficient or needs enhancement for module-based access control

**HIGH (strong value; completes implementation)**
- Write unit tests for all 5 infrastructure services: validation logic (FK checks, uniqueness, bounds, enum checks, XOR constraints), error paths, success cases (targeting ≥80% coverage per original success criteria)
- Write unit tests for all 5 infrastructure controllers: permission guards, HTTP response codes (201/200/204/400/404/409), pagination, filtering (targeting ≥70% coverage)
- Write integration tests for at least one entity (Parada) covering real database, transactional rollback, and FK-constraint enforcement
- Write frontend component tests (Vitest + Testing Library): form validation, list rendering, error states (targeting ≥70% coverage)

**MEDIUM (completes gap; optional if user scopes down)**
- Implement Línea↔Parada junction service methods: `addParada()`, `removeParada()`, `updateParadaOrder()` with ≥2 paradas constraint enforcement
- Implement Línea↔Parada controller endpoints: `POST /infrastructure/lineas/{id}/paradas`, `PATCH /infrastructure/lineas/{id}/paradas/{linea_parada_id}`, `DELETE /infrastructure/lineas/{id}/paradas/{linea_parada_id}`
- Implement dedicated `close(afectacionId)` service method for Afectación: sets `estado='CERRADA'`, `fecha_fin=now()`
- Implement Afectación controller endpoint: `POST /infrastructure/afectaciones/{id}/close` as convenience method (distinct from generic PATCH)

**LOW (missing reference; nice-to-have)**
- Create `apps/api/src/infrastructure/README.md` documenting DTOs, error codes, permission requirements, pagination, and FK validation strategy

### Out of Scope

- DetailPage modal/route architecture changes (current pattern is accepted UX)
- Estación↔Línea junction (`tbl_estacion_linea`) implementation — not confirmed as required; verify actual need before future work
- Reusable component cosmetics (StatusBadge, EntitySelector refactors)
- API rate limiting or request validation middleware
- Soft-delete vs hard-delete semantics review for Estación/Parqueo (only Parada's `CERRADA` soft-delete is confirmed)

## Capabilities

> **Contract with sdd-spec**: No new capabilities are introduced. All gaps close at the **implementation/testing level** of existing specs, not the specification level.
> If the spec-level behavior does not change (permission guard already required, junction methods already specified), they do NOT generate new spec files.
> Only list here if the **requirement** changes, not the implementation.

### New Capabilities

None — all items close implementation gaps in capabilities already specified (`infrastructure-parada`, `infrastructure-estacion`, `infrastructure-parqueo`, `infrastructure-linea`, `infrastructure-afectacion`).

### Modified Capabilities

None — the spec-level requirements for permission enforcement, testing, junction management, and close() methods were defined in `infraestructura` specs. This change implements them; it does not change the requirements themselves. No delta specs needed.

## Approach

### Permission Enforcement (Critical)
**Backend**: Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` decorator to each infrastructure controller method (or class-level decorator in NestJS if pattern supports it). Reference existing pattern in `apps/api/src/authentication/permissions.decorator.ts` and verify usage precedent elsewhere in the codebase (e.g., in other controllers if the decorator is already used; if not, this is the first use — confirm decorator works as expected by AuthenticationGuard).

**Frontend**: Enhance `AuthenticationGuard` (protected-route.tsx) to also check `user.scope.modules` inclusion (not just `isAuthenticated`). On `/infrastructure` route, if user lacks `'infrastructure'` in modules, redirect to `/landing` instead of rendering InfrastructurePage. This mirrors the pattern landing-page.tsx already uses.

### Test Coverage (High)
- Use **existing test patterns**: `apps/api/src/authentication/*.spec.ts` (Jest, mocked repos), `apps/api/test/*.integration-spec.ts` (real Postgres, transactional rollback), `apps/admin-web/src/test/` (Vitest + Testing Library)
- **Service tests**: Mock repositories, test validation (FK, uniqueness, bounds, XOR for Afectación), test error cases (404, 400, 409), test success paths
- **Controller tests**: Mock services, verify `@Permissions` is present and enforced, verify HTTP status codes and response shape
- **Integration tests**: Real test database, one full CRUD flow per entity (or at least Parada), verify FK constraints, verify soft-delete behavior
- **Frontend tests**: Form submission (success/error), list filtering, error state rendering, permission-check redirect behavior

### Junction Table Logic (Medium)
Implement in `linea.service.ts`:
- `addParada(lineaId, paradaId, orden, minutos)`: create tbl_linea_parada row, validate orden uniqueness per línea
- `updateParadaOrder(linea_parada_id, nuevaOrden, minutos)`: update orden and timing, enforce uniqueness
- `removeParada(lineaId, lineaParadaId)`: delete row, validate ≥2 paradas remain

Implement in `linea.controller.ts`: corresponding POST/PATCH/DELETE endpoints with appropriate status codes (201, 200, 204).

### Afectación Close Method (Medium)
Implement in `afectacion.service.ts`:
- `close(afectacionId)`: find afectación, set `estado='CERRADA'`, set `fecha_fin=now()`, save

Implement in `afectacion.controller.ts`:
- `POST /infrastructure/afectaciones/{id}/close`: call service, return 200 with updated DTO

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/infrastructure/parada/parada.controller.ts` | Modified | Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` to all 5 endpoints |
| `apps/api/src/infrastructure/estacion/estacion.controller.ts` | Modified | Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` to all 5 endpoints |
| `apps/api/src/infrastructure/parqueo/parqueo.controller.ts` | Modified | Add `@Permissions('INFRAESTRUCTURA_GESTIONAR')` to all 5 endpoints |
| `apps/api/src/infrastructure/linea/linea.controller.ts` | Modified | Add `@Permissions(...)`, implement junction endpoints (POST/PATCH/DELETE `/infrastructure/lineas/{id}/paradas`) |
| `apps/api/src/infrastructure/linea/linea.service.ts` | Modified | Implement `addParada()`, `updateParadaOrder()`, `removeParada()` |
| `apps/api/src/infrastructure/afectacion/afectacion.controller.ts` | Modified | Add `@Permissions(...)`, implement `POST /infrastructure/afectaciones/{id}/close` endpoint |
| `apps/api/src/infrastructure/afectacion/afectacion.service.ts` | Modified | Implement `close()` method |
| `apps/api/src/infrastructure/**/__tests__/` | New | Add *.spec.ts and *.integration-spec.ts for all 5 entities (services, controllers) |
| `apps/admin-web/src/features/dashboard/protected-route.tsx` | Modified | Enhance to check `user.scope.modules` and redirect if module not included |
| `apps/admin-web/src/features/infrastructure/**/__tests__/` | New | Add *.spec.tsx for forms, list pages, hooks |
| `apps/api/src/infrastructure/README.md` | New | Document DTOs, error codes, permission requirements, pagination |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Permission decorator doesn't exist in codebase or AuthenticationGuard doesn't check it | Low | Verify `@Permissions` decorator and guard integration before starting. Check that permission checking is actually wired in `authentication.guard.ts:56-69` (it is — confirmed by exploration). If tests fail, the wiring is wrong. |
| Frontend route guard redirect breaks other protected modules | Medium | Implement module check in `protected-route.tsx` carefully; test all protected routes (/landing, /profile, others) to ensure they still work. Consider a separate `ModuleGuard` component if logic grows. |
| Adding `@Permissions` to endpoints breaks existing API clients (e.g., integration tests, Postman collections) | Low | Change must happen — breaking existing unauthorized access is the point. Ensure test DB seed includes a user with `INFRAESTRUCTURA_GESTIONAR` permission for integration tests. |
| Junction table logic (≥2 paradas) is complex and easy to get wrong | Medium | Write thorough unit tests for edge cases: attempting to remove last parada (should fail 409), updating orden with duplicates (should fail 409), valid removals with 3+ paradas (should succeed). Use transactional tests to verify rollback. |
| Test coverage adds 200–300 lines per entity, PR size grows beyond 400-line budget | High | Use chained PRs: PR 1 (permission enforcement), PR 2 (service tests), PR 3 (controller/integration tests), PR 4 (frontend tests). This splits work by layer, keeps reviews focused. |
| Missing close() method in Afectación might be used by other features downstream | Low | Search codebase for `afectacion.close` or `.close()` calls on afectación objects. If found, implement before shipping. If none, it's safe to add in this change. |

## Rollback Plan

- **Permission enforcement**: Revert `@Permissions` decorators from all controllers (5 files); if no decorators exist in the codebase elsewhere, verify AuthenticationGuard still works without them (it will — line 61 checks if permissions exist; if none, guard passes)
- **Frontend module guard**: Revert `protected-route.tsx` to only check `isAuthenticated` (remove module lookup and redirect)
- **Tests**: Remove all new `__tests__/` files and folders under `apps/api/src/infrastructure/` and `apps/admin-web/src/features/infrastructure/`
- **Junction/close methods**: Revert service/controller files to pre-change state; if endpoints don't exist, API behavior is unchanged (existing code won't call them)
- **README**: Delete `apps/api/src/infrastructure/README.md` if created
- **Data**: No database migrations, so no data cleanup needed. Soft-deletes (estado='CERRADA') are idempotent; rolling back code leaves data intact

**Verification**: After rollback, verify Swagger/Postman tests pass with the old permission-free access pattern (or manually delete decorators to confirm), and frontend routes load without module-check redirects.

## Dependencies

- Existing: `AuthenticationGuard`, `@Permissions` decorator, `AuthenticationService` (all already in `infraestructura` design)
- No new npm packages required (testing tools, Vitest, Testing Library, Jest, TypeORM already installed per existing test patterns)
- No database migrations

## Success Criteria

- [ ] All 5 infrastructure controller endpoints return 403 Forbidden when called by a user WITHOUT `INFRAESTRUCTURA_GESTIONAR` permission (or appropriate 401 if no token)
- [ ] Frontend `/infrastructure` route redirects to `/landing` for users without `'infrastructure'` in `user.scope.modules`
- [ ] Service tests pass: ≥80% coverage (validation, FK checks, error paths verified)
- [ ] Controller tests pass: ≥70% coverage (permission guards, response codes, pagination verified)
- [ ] Integration test passes: at least one entity (Parada) CRUD cycle against real test database
- [ ] Frontend tests pass: form validation, list rendering, error states verified
- [ ] Línea junction methods implemented and tested (if in-scope): `addParada()`, `removeParada()`, `updateParadaOrder()` with ≥2 paradas constraint
- [ ] Afectación `close()` method implemented and tested (if in-scope): sets estado='CERRADA', fecha_fin=now()
- [ ] Swagger documentation auto-generated and accessible at `/swagger` (already working per existing design; verify permission metadata shows in docs)
- [ ] No 400-line PR budget exceeded (use chained PRs if needed per proposal risk mitigation)

## Notes

- Original `infraestructura` plan included these items in phases 2–6 (services + controllers), 8–12 (frontend), and 13–14 (integration/testing/decisions). This change brings them home.
- Permission enforcement was implicit in Decision #1 (authentication-only guard was designed as a checkpoint, with @Permissions as the follow-up); shipping without it leaves the module vulnerable.
- Test coverage aligns with original proposal success criteria (services ≥80%, controllers ≥70%, frontend ≥70%).
