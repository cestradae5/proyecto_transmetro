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
- [x] A2 Frontend `/reports` audit log page: hook, filters, table, detail dialog, route, landing link, tests
- [x] A3 Full verification (api jest, web vitest, tsc)
- [x] A4 DB-backed e2e for `/audit-log` against `transmetro_test` (gap: A1 unit specs mock SQL)

## Pending follow-ups
- Resolved by `odd/tasks/bitacora-completion.md`: Infrastructure CRUD now writes `tbl_bitacora`, and failed logins are recorded (NULL employee/entity, no email) and listed by the viewer via LEFT JOIN.

## Progress / evidence
Branch: `feat/audit-log-viewer` (from main @ 2ba9f0a).

Routing note: subagent runtime failed 3/3 (explore x2, worker x1, "assistant reported an error"); A1 implemented inline as fallback.

A1 evidence (test-first): RED 3 suites failed (module missing) -> GREEN `npm test -- audit-log` 3 suites / 16 tests; full api `npm test` 60 suites / 708 passed; `tsc -p tsconfig.build.json` exit 0; no tsconfig.json errors in audit-log. Commit: d3c4421.

A1 follow-up: date-only `to` bound now sent as next date-only (session time zone, consistent with `from`). Commit: d20e798.

A2 evidence (test-first): RED 6 files failed (modules missing, route/card not navigable) -> GREEN `vitest run src/test/audit-log src/test/authentication/landing-page.spec.tsx` 6 files / 29 tests; refactor (page reset without extra request, debounced user filter test) -> audit-log 5 files / 22 tests. Commit: a15cbcb.

A3 evidence: web `vitest run` 69 files / 527 passed; api `npm test` 60 suites / 708 passed; api `tsc -p tsconfig.build.json` exit 0; web `tsc -b` exit 0. No lint script configured. No DB-backed e2e for audit-log at A3 time (gap closed by A4).

A4 evidence: `apps/api/test/audit-log.e2e-spec.ts` (16 tests) against `transmetro_test` with `apps/api/.env` exported literally (bash read-loop; `. ./.env` breaks on special chars in the password). `npm run test:e2e -- audit-log` 16/16. Mutation checks: removing LIKE escaping -> wildcard test fails; reverting the date-only `to` to a UTC timestamp -> date-only test fails (confirms the d20e798 fix: DB session time zone is not UTC). Full `npm run test:e2e` 8 suites / 84 passed. Leftovers after run: 0 audit rows, 0 employees. Commit: 6580001.
