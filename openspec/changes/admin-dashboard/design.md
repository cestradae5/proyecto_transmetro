# Design: Admin Dashboard — 8-Module RBAC & Permission-Aware Navigation

## Technical Approach

The `/landing` route, `AuthenticationGuard` (frontend), NestJS `AuthenticationGuard` + `@Permissions`, and JWT-stateless login are already implemented (Task 2.4 Phase 1). The `/admin` scaffold is already removed (`app.spec.tsx` asserts its absence). The gap is purely in the **module registry**: `PERMISSION_TO_MODULE` currently collapses distinct spec modules into 6 catch-all keys (`gis`, `report`) instead of the spec's 8 canonical modules. `database/init.sql` already grants the approved role-permission matrix (including `OPERADOR_CENTRAL`), so **no schema or seed migration is required** — this is an application-layer remapping plus test coverage.

## Architecture Decisions

| # | Choice | Alternatives Considered | Rationale |
|---|--------|--------------------------|-----------|
| 1 | Expand `PERMISSION_TO_MODULE` to 8 canonical keys: `infrastructure`, `fleet`, `personnel`, `operational_alerts`, `central_operations_panel`, `administrative_reports`, `audit_log`, `recharge_reporting` | Keep 6 collapsed keys and rename in spec instead | Spec Requirement 2 explicitly enumerates 8 modules; collapsing hides distinct permission boundaries (e.g. alerts vs. reports) from the role-matrix test |
| 2 | Recompute `scope.modules` inside `verifyToken()` via `deriveModulesFromPermissions(payload.permissions)` instead of trusting `payload.scope.modules` baked at login | Leave `/me` trusting the JWT-baked scope (current behavior) | JWTs live 12h; recomputing from the stable `permissions` array on every `/me` call makes module-key renames apply immediately, without waiting for re-login |
| 3 | Keep `self_profile` as an ambient, ungated card (every role gets `PERFIL_PROPIO_CONSULTAR`), excluded from the 8-module RBAC test matrix | Count it as a 9th gated module | Spec's Requirement 2 and 6 name exactly 8 modules; profile access is universal self-service, not a role-differentiated capability |
| 4 | No DB/seed changes | Add new scoped permission codes for `personnel` | `database/init.sql` already grants `EMPLEADOS_PERFILES_ADMINISTRAR` to `OPERADOR_CENTRAL` and admin, matching the approved matrix (Engram #1817) exactly |
| 5 | Duplicate the typed module-key union in both apps (existing pattern, enforced by test) | Extract a shared `@transmetro/contracts` package | No shared-package infra exists in this workspace today; introducing one is out of scope for this change |

## Data Flow

    Google Sign-In → AuthenticationService.login()
         │ permissions: string[] (from tbl_rol_permiso)
         ▼
    JWT { employeeId, email, roles, permissions, scope.modules }
         │
    Every /authentication/me call
         ▼
    verifyToken() → deriveModulesFromPermissions(payload.permissions)
         │ (8-key PERMISSION_TO_MODULE, always current)
         ▼
    MeResult.scope.modules ──→ AuthContext.user.scope.modules
         │
         ▼
    LandingPage renders MODULE_LABELS[module] cards, filtered by permission

Backend enforcement is independent: any protected endpoint uses `@Permissions(...)` + `AuthenticationGuard`, denying access regardless of what the frontend renders (Requirement 4).

## File Changes

| File | Action | Description |
|------|--------|--------------|
| `apps/api/src/authentication/authentication.service.ts` | Modify | Expand `PERMISSION_TO_MODULE` to 8 keys; expand `MODULE_ORDER`; call `deriveModulesFromPermissions(payload.permissions)` inside `verifyToken()` |
| `apps/admin-web/src/features/authentication/landing-page.tsx` | Modify | Update `MODULE_LABELS` to the 8 canonical keys + `self_profile`; icons/labels per module |
| `apps/api/src/authentication/rbac-module-derivation.spec.ts` | Modify | Add `OPERADOR_CENTRAL_PERMISSIONS` fixture (mirrors `init.sql`); update `FRONTEND_MODULES` to 8 keys; fix `PILOTO`/`GUARDIA`/`OPERADOR_ESTACION` expected outputs for the split modules |
| `apps/api/src/authentication/role-module-matrix.spec.ts` | Create | Full 5-role × 8-module coverage test (Requirement 6), including the "unknown role" edge case |
| `apps/api/src/authentication/authentication.guard.spec.ts` | Modify | Update stale module-vocabulary mocks flagged in prior session |

## Interfaces / Contracts

```typescript
export const MODULE_KEYS = [
  "infrastructure", "fleet", "personnel", "operational_alerts",
  "central_operations_panel", "administrative_reports",
  "audit_log", "recharge_reporting",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export const PERMISSION_TO_MODULE: Record<string, ModuleKey> = {
  INFRAESTRUCTURA_GESTIONAR: "infrastructure",
  FLOTA_GESTIONAR: "fleet",
  FLOTA_ESTACION_SOLICITAR: "fleet",
  UNIDAD_ASIGNADA_CONSULTAR: "fleet",
  EMPLEADOS_PERFILES_ADMINISTRAR: "personnel",
  ALERTAS_OPERATIVAS_GESTIONAR: "operational_alerts",
  ALERTAS_ESTACION_GESTIONAR: "operational_alerts",
  ALERTAS_UNIDAD_GESTIONAR: "operational_alerts",
  METRICAS_UNIDAD_REPORTAR: "operational_alerts",
  PANEL_OPERATIVO_CENTRAL_USAR: "central_operations_panel",
  REPORTES_ADMINISTRATIVOS_CONSULTAR: "administrative_reports",
  AUDITORIA_BITACORA_CONSULTAR: "audit_log",
  RECARGAS_REPORTES_CONSULTAR: "recharge_reporting",
  PERFIL_PROPIO_CONSULTAR: "self_profile",
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | `deriveModulesFromPermissions` completeness, ordering, dedup | Jest, extend `rbac-module-derivation.spec.ts` |
| Unit | Every `PERMISSION_TO_MODULE` value is a known frontend key | Existing assertion pattern, extended to 8 keys |
| Integration | `/authentication/me` returns permission-derived modules for each of 5 seeded roles | Jest + NestJS testing module, mocked `EmployeeRepository` |
| Integration | `AuthenticationGuard` denies protected routes lacking required permission | Existing `authentication.guard.spec.ts` |
| Component | `LandingPage` renders only cards present in `user.scope.modules` | Vitest + Testing Library, existing `app.spec.tsx` pattern |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary in this change.

## Migration / Rollout

No database migration. No feature flag needed: the module-key rename self-heals on next `/authentication/me` call per Decision 2, so in-flight 12h JWTs display correct modules without forcing re-login. Deploy backend and frontend together (mismatched `PERMISSION_TO_MODULE` vs `MODULE_LABELS` keys silently drop cards, caught by the completeness unit test).

## Open Questions

- [ ] `/gis` route (`app.tsx`) is currently unguarded by `AuthenticationGuard`. Spec text only requires gating `/landing`; confirm whether GIS access should also require the `infrastructure` permission in a follow-up change.
- [ ] `ROLES_PERMISOS_ADMINISTRAR` (role/permission administration) is granted only to admin and is not mapped to any of the 8 modules. Confirm it stays unmapped (admin-only capability not surfaced as a dashboard card) or should fold into `personnel`.
- [ ] Pre-existing stateless-JWT limitation: mid-session permission revocation is only reflected after the 12h token expires (Decision 2 fixes module-*naming* drift, not *permission* drift). Confirm this residual gap is acceptable for this change or needs a separate follow-up.
