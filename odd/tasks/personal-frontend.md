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
- [x] F1 API roles endpoint: `GET /personal/roles` (active roles: id, code, name), permission-guarded, Swagger, unit tests.
- [x] F2 Web foundation: types, `permissions.ts`, API error mapping, roles + employees hooks (`use-empleados`, `use-roles`), specs.
- [x] F3 Employee list UI: page, table with search/status/role filters (server-side), loading/error/empty states, route `/personal` + landing card navigation, specs.
- [x] F4 Create/edit form + dialog: all fields, manual validation (DPI 13 digits, phone, email, date), 409/400 error display, specs.
- [x] F5 Delete + status flow: confirm, 409 "deactivate instead" message, permission-gated actions, specs.
- [ ] F6 E2E + docs: Playwright path if feasible against preview, feature README.

## Acceptance criteria
- A user with module `personnel` can open `/personal` from the landing card; others are redirected.
- With `EMPLEADOS_PERFILES_ADMINISTRAR` the user can list (filtered), create, edit and delete employees; without it, mutation controls are hidden.
- The role select and role filter are populated from the API.
- Duplicate email/DPI (409), invalid payload (400) and delete-with-history (409) show a clear Spanish message.
- `npm test -w @transmetro/api`, `npm test -w @transmetro/admin-web`, API build and `tsc -b` have no new failures.

## Progress / evidence
- 2026-10-02: feature doc created after exploration (pattern mapped from `fleet` and `infrastructure`; roles lookup gap found; user chose a new endpoint).

- 2026-10-02 F1 done, commit `f01b82e` on `feature/personal-frontend-01-roles-endpoint` (+166/-4, 7 files). Separate `PersonalRolesController` at `personal/roles` so `GET :id` can never capture it. Checks: `npm test -w @transmetro/api -- personal` 5 suites / 85 tests (writer + parent re-run); full api suite 42 suites / 517 tests; `npm run build -w @transmetro/api` ok (writer). Not done: e2e extension (needs real Postgres test DB); parent read controller and service diff. RDD: not run (candidate not assessed).

## Route declaration
- Exploration: delegated (mapping across 4+ files: API contract, front pattern, routing, tests).
- F1: delegated writer (7 files). Parent read controller and service diff and re-ran the focused tests.
- F2: delegated writer (9 files). Parent read the main hook and re-ran tests and tsc.
- F3: delegated writer (9 files). Parent read the page and routing diff and re-ran tests and tsc.
- F4: delegated writer (9 files). Parent checked payload logic against the API and re-ran tests and tsc.
- F5: delegated writer (6 files). Parent read the dialog in full and re-ran tests and tsc.
- 2026-10-02 F2 done, commit `7a4e516` on `feature/personal-frontend-02-web-foundation` (+684, 9 files: ~247 source, ~437 specs). Checks: `npm test -w @transmetro/admin-web -- personal` 4 files / 30 tests (writer + parent re-run); full web suite 35 files / 255 tests; `npx tsc -b` exit 0 (parent re-run; writer fixed one TS2532 in its own spec). Notes: `permissions.ts` reuses `hasPermission` from fleet; `getPersonalErrorMessage` exported next to `mapPersonalError`; `search` is trimmed and omitted when blank; request-id guard ignores stale responses; `EmpleadoPayload` split into Create/Update types. Parent read `use-empleados.ts` in full. RDD: not run.
- 2026-10-02 F3 done, commit `6be8e62` on `feature/personal-frontend-03-list-ui` (+535/-1, 9 files, mostly specs; over the ~400 heuristic, nothing trimmed). Checks: `npm test -w @transmetro/admin-web -- personal` 7 files / 45 tests (writer); full web suite 38 files / 271 tests and `npx tsc -b` exit 0 (parent re-run); `npm run build -w @transmetro/admin-web` ok (writer). Notes: search debounced 300 ms before reaching the hook; roles failure disables the role filter with a non-blocking notice; hire date shown DD/MM/YYYY by string split (no Date, no TZ shift); page spec mocks `apiClient` so the debounce test asserts the real URL. Parent read `index.tsx` in full and the routing/landing diff. RDD: not run.
- 2026-10-02 F4 done, commit `72b9a7f` on `feature/personal-frontend-04-form` (+941/-6, 9 files; over the ~400 heuristic, nothing trimmed). Checks: `npm test -w @transmetro/admin-web -- personal` 11 files / 73 tests (writer); full web suite 42 files / 299 tests and `npx tsc -b` exit 0 (parent re-run); `npm run build -w @transmetro/admin-web` ok (writer). Notes: clearing a stored optional field sends explicit `null` (the API accepts it via `@IsOptional` and the service writes it; `"` would fail phone/hireDate regex and store `"` for free text); name/status/dpi/email/roleId cannot be cleared; `UpdateEmpleadoPayload` optionals widened to `string | null`; dialog blocks create/edit with a clear alert when roles failed to load; an employee's current role is added to the select if no longer active. Parent grepped the payload logic and confirmed the null-clears behaviour against `personal.rules.spec.ts`. RDD: not run.
- Follow-up (backend, not done): clearing optional fields via explicit `null` is implicit behaviour, not documented in Swagger or the module README; make the contract explicit.
- 2026-10-02 F5 done, commit `0060e07` on `feature/personal-frontend-05-delete` (+564/-10, 6 files; over the ~400 heuristic, nothing trimmed). Checks: `npm test -w @transmetro/admin-web -- --run personal` 14 files / 90 tests (writer); full web suite 45 files / 316 tests and `npx tsc -b` exit 0 (parent re-run); `npm run build -w @transmetro/admin-web` ok (writer). Notes: in-app `alertdialog` instead of `window.confirm`; toggle activate/deactivate goes straight to `PATCH {status}`, failures show a dismissible banner; 409 on delete keeps the dialog open with the backend message and offers 'Desactivar en su lugar' for ACTIVO employees; a row's actions are disabled while its request is pending; table stays read-only when callbacks are absent. Parent read `confirm-delete-dialog.tsx` in full. Known gap: the deactivate shortcut appears after ANY failed delete of an ACTIVO employee, including the 'cannot delete yourself' 409 or a 404, where deactivating is not the right suggestion. RDD: not run.

## Key learnings
- The backend ODD (`personal-backend`) listed role administration as out of scope and validated `roleId` server-side (exists and active), but never asked how a client discovers valid role IDs. It was a client-contract gap that only surfaced when the first consumer (this frontend) was explored.

## Next step
F6 on `feature/personal-frontend-06-e2e-docs` (branched from the F5 branch).
