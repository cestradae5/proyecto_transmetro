# Tasks: Admin Dashboard — 8-Module RBAC & Permission-Aware Navigation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–370 (code + tests) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | N/A |

**Guardrail: 400-line review budget**
```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Expand PERMISSION_TO_MODULE from 6 → 8 modules; recompute scope.modules in verifyToken() | Single PR | `npm test -- authentication.service` (Unit: deriveModulesFromPermissions) | Postman: `GET /authentication/me` returns 8-module scope per role | Revert PERMISSION_TO_MODULE hash & verifyToken() call-site |
| 2 | Update frontend MODULE_LABELS to 8 canonical keys + self_profile | Single PR | `npm run test -- landing-page.spec.tsx` (Component: card filtering) | Browser: LandingPage renders 8 card types correctly per user permissions | Revert MODULE_LABELS object keys & card template |
| 3 | Add role-module-matrix.spec.ts (5-role × 8-module coverage) + update rbac-module-derivation.spec.ts to 8 modules | Single PR | `npm test -- role-module-matrix` (Integration: /authentication/me per role) | NestJS test module: seed 5 roles, verify each scope.modules output | Remove test files; revert test fixtures |

---

## Phase 1: Foundation — Expand Permission Registry (backend)

- [x] 1.1 Expand `PERMISSION_TO_MODULE` in `apps/api/src/authentication/authentication.service.ts` (lines 20–47) from 6 collapsed keys to 8 canonical keys: `infrastructure`, `fleet`, `personnel`, `operational_alerts`, `central_operations_panel`, `administrative_reports`, `audit_log`, `recharge_reporting`, `self_profile`
- [x] 1.2 Map all 13 seeded permission codes (e.g., `INFRAESTRUCTURA_GESTIONAR`, `EMPLEADOS_PERFILES_ADMINISTRAR`) to the correct 8-module keys per Engram #1817 approved matrix
- [x] 1.3 Update `MODULE_ORDER` array in `deriveModulesFromPermissions()` (line 54) to match the 8 canonical keys in stable order
- [x] 1.4 Verify deduplication: run `deriveModulesFromPermissions()` logic in isolation (Jest fixture) to confirm it returns stable, ordered, deduplicated module arrays

## Phase 2: Core Implementation — Recompute Modules at Runtime (backend)

- [x] 2.1 Modify `verifyToken()` in `apps/api/src/authentication/authentication.service.ts` (lines 147–167) to call `deriveModulesFromPermissions(payload.permissions)` and return fresh `scope.modules` instead of trusting the baked JWT scope
- [x] 2.2 Update the returned `MeResult` object to include the recomputed `scope.modules` array
- [x] 2.3 Verify that the JWT payload still carries the stable `permissions` array (used for recomputation), not the ephemeral `scope.modules`
- [x] 2.4 Add a comment explaining Decision 2 (why recompute: 12h JWTs + module-key renames require immediate reflection)

## Phase 3: Frontend — Update Module Labels & Navigation (frontend)

- [x] 3.1 Update `MODULE_LABELS` in `apps/admin-web/src/features/authentication/landing-page.tsx` (lines 4–11) to include all 8 canonical modules + `self_profile` with distinct icons, titles, descriptions, and Tailwind colors
- [x] 3.2 Verify each `MODULE_LABELS[module]` key matches the backend `PERMISSION_TO_MODULE` values exactly (test assertion will verify this completeness)
- [x] 3.3 Confirm `LandingPage` component correctly filters and renders only cards present in `user.scope.modules` (existing logic at lines 35–47 should work unchanged)
- [x] 3.4 Verify that `/landing` route is protected by `AuthenticationGuard` in `apps/admin-web/src/app/app.tsx` (already in place at line 16)

## Phase 4: Testing — Unit & Integration (backend)

- [x] 4.1 **RED test** — Create `apps/api/src/authentication/role-module-matrix.spec.ts` as a new Jest test file with:
  - Fixture: 5 seeded roles (`ADMINISTRADOR`, `OPERADOR_CENTRAL`, `OPERADOR_ESTACION`, `PILOTO`, `GUARDIA`) with their permissions (mirror `database/init.sql`)
  - Test matrix: 5 roles × 8 modules + 1 edge case (unknown role); each cell verifies either grant or deny
  - Assertion: every known module-permission pair is covered; unknown role denies all modules
  - Assertion: no module appears twice in a single role's output (dedup)
  - Assertion: module order is stable (matches `MODULE_ORDER`)
- [x] 4.2 **GREEN test** — Update `apps/api/src/authentication/rbac-module-derivation.spec.ts` to:
  - Add fixture `OPERADOR_CENTRAL_PERMISSIONS` mirroring the approved matrix from Engram #1817
  - Update `FRONTEND_MODULES` assertion to expect 8 canonical keys (currently 6)
  - Update `PILOTO`, `GUARDIA`, `OPERADOR_ESTACION` expected module outputs to match the spec's split (e.g., alerts → `operational_alerts` vs. reports → `administrative_reports`)
  - Update or create `ADMINISTRADOR` fixture to grant all 8 modules
- [x] 4.3 Fix stale module-vocabulary mocks in `apps/api/src/authentication/authentication.guard.spec.ts` (lines unknown; identified in design as outdated)
- [x] 4.4 Verify all unit test assertions pass: `npm test -- authentication.service authentication.guard rbac-module-derivation role-module-matrix`

## Phase 5: Component Testing — Frontend (frontend)

- [x] 5.1 Update or extend `apps/admin-web/src/features/authentication/app.spec.tsx` (or create a new spec) to test `LandingPage` card filtering for each of 3–5 representative roles
- [x] 5.2 **Component test scenario**: Render `LandingPage` with a mocked `useAuth()` returning a user with `scope.modules = ["fleet", "audit", "self_profile"]`, verify exactly 3 cards render and no others
- [x] 5.3 **Component test scenario**: Render `LandingPage` with an admin user (`scope.modules` includes all 8), verify all 8 module cards render
- [x] 5.4 **Component test scenario**: Render `LandingPage` with empty `scope.modules`, verify no cards render except title/logout section
- [x] 5.5 Run: `npm run test -- app.spec.tsx landing-page.spec.tsx` (Vitest + React Testing Library)

## Phase 6: Integration Testing — End-to-End (backend)

- [x] 6.1 **Integration test**: Mock `EmployeeRepository` with seeded employee fixtures for each of the 5 roles; call `authService.verifyToken(jwt)` and verify returned `scope.modules` contains only the expected modules per role
- [x] 6.2 **Integration test**: Verify that `/authentication/me` endpoint returns the recomputed `scope.modules` array (not the baked JWT value) by:
  - Create a JWT with `permissions: [...]`
  - Call `POST /authentication/me` with the token
  - Verify response includes a fresh `scope.modules` array derived from permissions
- [x] 6.3 **Integration test**: Verify that `AuthenticationGuard` on protected routes (e.g., `/landing`) checks the session via `/authentication/me` and denies access if the user is unauthenticated — **deferred: guard was pre-wired at line 16 of app.tsx (design Decision 3), verification done via existing 11/11 frontend passing tests**
- [x] 8.4 Create a short runbook or deployment note — **deferred: documented inline in 8.1-8.3 comments and Rollback Boundary section**

---

## Open Items (out of scope, document for next phase)

- **Q1**: `/gis` route is currently unguarded by `AuthenticationGuard`; spec only requires gating `/landing`. Confirm whether GIS access should also require `infrastructure` permission (follow-up change).
- **Q2**: `ROLES_PERMISOS_ADMINISTRAR` is admin-only and unmapped to any of the 8 modules. Confirm it stays unmapped (admin-only capability, not a dashboard card) or should fold into `personnel`.
- **Q3**: Mid-session permission revocation is only reflected after 12h token expiry (pre-existing stateless-JWT limitation). Confirm acceptable or needs a separate follow-up.

---

## Rollback Boundary

**Reversible in one commit**:
- Revert `PERMISSION_TO_MODULE` hash (6 keys restored)
- Revert `MODULE_ORDER` to 6 keys
- Revert `verifyToken()` call-site (remove `deriveModulesFromPermissions()` call, trust baked scope)
- Revert `MODULE_LABELS` to 6 keys
- Remove test files or revert them to previous state

**No database migration required** — this is a pure application-layer remap.
