# Audit log viewer (bitácora)

## Objective
Let authorized users (permission `AUDITORIA_BITACORA_CONSULTAR`) browse `tbl_bitacora` read-only: paginated table, filters (date range, user, module, action, result) and a detail dialog showing the JSONB `detalle`. Part of REQ-FUNC-012, module card "Reportes".

## Scope
- Backend: new `apps/api/src/audit-log/` (module, controller, service, DTOs, specs) registered in `AppModule`.
  - `GET /audit-log` query: `from`, `to` (ISO date), `user` (name/email text), `module`, `action`, `result`, `page` (default 1), `pageSize` (default 20, max 100). Response `{ items, total, page, pageSize }`, newest first. Item: id, createdAt, module, action, entityType, entityId, result, detalle, employee { id, name, email }.
  - `GET /audit-log/options`: distinct `modules` and `actions` for filter dropdowns.
  - No mutation endpoints (log is not editable).
- Frontend: new `apps/admin-web/src/features/audit-log/` page at `/reports` (guard `requiredModule="reports"`), landing card "Reportes" navigates there; tests under `src/test/audit-log/`.
- Out of scope: writing audit rows from Infrastructure (separate feature, pending), administrative reports, export.

## Constraints / assumptions
- Decision (user): general viewer over what is already audited (auth LOGIN, personal, fleet). Detail dialog for `detalle`: yes.
- Decision (orchestrator): server-side pagination because the log grows unbounded; user filter is free text since the employee list needs the personnel permission.
- Patterns: `AuthenticationGuard` + `@Permissions`, class-validator query DTO, English identifiers, Spanish UI labels, `apiClient`, tailwind UI.
- Pre-existing unrelated uncommitted changes (`database/seed-current-data.sql`, `.atl/*`) are not part of this feature.
- Runners: jest (`apps/api`), vitest (`apps/admin-web`), `tsc`.

## Tasks
- [x] A1 Backend `audit-log` module: query DTO, service (filters + pagination + options), controller, specs
- [ ] A2 Frontend `/reports` audit log page: hook, filters, table, detail dialog, route, landing link, tests
- [ ] A3 Full verification (api jest, web vitest, tsc)

## Pending follow-ups
- Infrastructure CRUD does not write `tbl_bitacora` yet (REQ-FUNC-012 gap).

## Progress / evidence
Branch: `feat/audit-log-viewer` (from main @ 2ba9f0a).

Routing note: subagent runtime failed 3/3 (explore x2, worker x1, "assistant reported an error"); A1 implemented inline as fallback.

A1 evidence (test-first): RED 3 suites failed (module missing) -> GREEN `npm test -- audit-log` 3 suites / 16 tests; full api `npm test` 60 suites / 708 passed; `tsc -p tsconfig.build.json` exit 0; no tsconfig.json errors in audit-log.
