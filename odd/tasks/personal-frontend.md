# Personal frontend (employee administration UI)

## Objective
Add a "Personal" page to `apps/admin-web` with full employee CRUD (list with search/status/role filters, create, edit, delete) on top of the existing `personal/empleados` API, plus the small roles-lookup endpoint the UI needs.

## Problem
The Personal backend (`/personal/empleados`) is merged to `main`, but the landing card for module `personnel` is not navigable and there is no page, hook or route. The API also exposes no way to list roles, which the role select and role filter require (`roleId` is a bigint string, so hardcoding is fragile).

## Why
Operations staff (OPERADOR_CENTRAL, ADMINISTRADOR_SISTEMA) need to manage the workforce from the web app instead of calling the API by hand.

## Decisions (user)
- ODD, full CRUD scope (not list/detail only).
- Roles source: **new API endpoint** (`GET /personal/roles`), done inside this feature as the first task.
- Delivery strategy: `ask-on-risk` -> forecast ~1,000+ authored changed lines; chain strategy chosen: **`feature-branch-chain`** (PR 1 targets the tracker branch, later PRs target the previous PR branch, only the tracker merges to main).
- Tracker branch: `feature/personal-frontend`. Slice branches: `feature/personal-frontend-0N-<slug>`.

## Assumptions (not asked; revisit if wrong)
- The roles endpoint returns only active roles (id, code, name) and is guarded by the same `EMPLEADOS_PERFILES_ADMINISTRAR` permission, living in `apps/api/src/personal/`.
- Filters are sent to the API as query params (the API supports them) instead of filtering client-side.
- The list endpoint has no pagination; the UI renders the full array.
- Status changes (activate/deactivate) go through the edit form via `PATCH {status}`; no dedicated route exists.
- Delete uses the same confirm pattern as fleet; a 409 shows the backend message ("deactivate instead").
- Frontend access: route `/personal` gated by `requiredModule="personnel"`; mutation controls gated by `EMPLEADOS_PERFILES_ADMINISTRAR`.
- No new libraries: plain `useState` hooks, Tailwind, manual form validation, as in `fleet`/`infrastructure`.

## Scope
- `apps/api/src/personal/**` (roles endpoint only), `apps/admin-web/src/features/personal/**`, `apps/admin-web/src/app/app.tsx`, `features/authentication/landing-page.tsx`, specs in `apps/admin-web/src/test/personal/`, docs.
- Out of scope: role/permission administration, pagination, backend changes to the employee endpoints, sidebar navigation.

## Constraints
- Code, comments, identifiers in English; user-facing UI copy in Spanish (matches existing front).
- Follow the `features/fleet` layout: `index.tsx`, `hooks/`, `types/`, `utils/`, `components/<entity>/`.
- Nest default error body `{statusCode, message, error}`: map by status code, not by domain code.
- ~400 authored changed lines per task is a planning heuristic only.

## Mode
- TDD: not configured; API runner `jest` (`npm test -w @transmetro/api`), web runner `vitest` (`npm test -w @transmetro/admin-web`). Ordinary functional checks + `npm run build -w @transmetro/api` + `npx tsc -b` in admin-web.
- Branch: `feature/personal-frontend` (from `main` 46c0ffa).

## Tasks
- [ ] F1 API roles endpoint: `GET /personal/roles` (active roles: id, code, name), permission-guarded, Swagger, unit tests.
- [ ] F2 Web foundation: types, `permissions.ts`, API error mapping, roles + employees hooks (`use-empleados`, `use-roles`), specs.
- [ ] F3 Employee list UI: page, table with search/status/role filters (server-side), loading/error/empty states, route `/personal` + landing card navigation, specs.
- [ ] F4 Create/edit form + dialog: all fields, manual validation (DPI 13 digits, phone, email, date), 409/400 error display, specs.
- [ ] F5 Delete + status flow: confirm, 409 "deactivate instead" message, permission-gated actions, specs.
- [ ] F6 E2E + docs: Playwright path if feasible against preview, feature README.

## Acceptance criteria
- A user with module `personnel` can open `/personal` from the landing card; others are redirected.
- With `EMPLEADOS_PERFILES_ADMINISTRAR` the user can list (filtered), create, edit and delete employees; without it, mutation controls are hidden.
- The role select and role filter are populated from the API.
- Duplicate email/DPI (409), invalid payload (400) and delete-with-history (409) show a clear Spanish message.
- `npm test -w @transmetro/api`, `npm test -w @transmetro/admin-web`, API build and `tsc -b` have no new failures.

## Progress / evidence
- 2026-10-02: feature doc created after exploration (pattern mapped from `fleet` and `infrastructure`; roles lookup gap found; user chose a new endpoint).

## Route declaration
- Exploration: delegated (mapping across 4+ files: API contract, front pattern, routing, tests).

## Key learnings
- The backend ODD (`personal-backend`) listed role administration as out of scope and validated `roleId` server-side (exists and active), but never asked how a client discovers valid role IDs. It was a client-contract gap that only surfaced when the first consumer (this frontend) was explored.

## Next step
Start F1 on `feature/personal-frontend-01-roles-endpoint`.
