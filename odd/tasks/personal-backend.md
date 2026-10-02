# Personal backend (employee administration)

## Objective
Expose an administrative CRUD API for employees (module "Personal") in `apps/api`, protected by the existing `EMPLEADOS_PERFILES_ADMINISTRAR` permission, with the extended HR profile fields the user requested.

## Problem
`tbl_empleado` only holds name, email, status and role, and the only code touching it is the login flow (`EmployeeRepository.findEligibleByEmail`). Login is Google-by-email, so an employee must exist before they can sign in, yet there is no way to create, edit or remove employees through the API.

## Why
Operations staff (OPERADOR_CENTRAL, ADMINISTRADOR_SISTEMA) need to manage the workforce (pilots, guards, station operators) without touching the database by hand.

## Decisions (user)
- Use ODD (not SDD): known CRUD pattern, existing entity, no architectural ambiguity.
- New employee fields: telefono, DPI, fecha de ingreso, direccion, numero de licencia, historial educativo, idiomas. Historial educativo and idiomas are **free text columns** on `tbl_empleado` (no child tables).
- `DELETE` **physically deletes** the employee (not a soft delete).
- **DPI is mandatory** (API level, create and update).
- **Numero de licencia is optional for every role** (`licencia_emple` stays a nullable column). It was originally mandatory for employees whose role code is `PILOTO`; the user reversed that on 2026-10-02 while the change was still local and unpushed, so the rule was rewritten out of the branch instead of being added and later reverted.
- Delivery: `feature-branch-chain`.

## Assumptions (not asked; revisit if wrong)
- Physical delete is blocked by foreign keys for any employee with history (sessions, audit log, pilot assignment, alerts...). In that case the API answers **409** telling the caller to set `status: INACTIVO` instead. Deactivation/reactivation is done via `PATCH` with `status`.
- Mandatory DPI is enforced by the API (DTO validation), while the DB column stays nullable so legacy rows (the seeded admin has no DPI) keep working. DPI is unique when present and exactly 13 digits.
- No service-level rule reads the licence: create, update and role changes never inspect it, so an absent or blank `licenseNumber` is always accepted. `licencia_emple` stays nullable in the DB and `@IsOptional()` in the DTO (max 30 chars).
- Routes live under `personal/empleados`; code lives in `apps/api/src/personal/`.
- Schema source of truth stays `database/init.sql`; new columns use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so existing databases upgrade (precedent: `tbl_bitacora.detalle`).

## Scope
- `database/init.sql`, `apps/api/src/authentication/entities/employee.entity.ts` (new nullable columns only), new `apps/api/src/personal/**`, `apps/api/src/app.module.ts` wiring, tests, module README.
- Out of scope: frontend, role/permission administration (`ROLES_PERMISOS_ADMINISTRAR`), child tables, authentication contract changes.

## Constraints
- Code, comments, identifiers and Swagger text in English; user-facing error messages in Spanish like sibling modules. Follow `infrastructure/parada` conventions (`AuthenticationGuard`, `@Permissions`, class-validator DTOs, global `ValidationPipe` whitelist+transform).
- Do not change `authentication.service/guard/controller/contracts`.
- ~400 authored changed lines per task is a planning heuristic only.

## Mode
- TDD: not configured; runner `jest` (`npm test -w @transmetro/api`; e2e needs `apps/api/.env` exported into the shell). Ordinary functional checks + `npm run build -w @transmetro/api`.
- Delivery strategy: `ask-on-risk` -> forecast ~700 authored changed lines; chain strategy chosen: **`feature-branch-chain`**.
- Tracker branch: `feature/personal-backend` (from `origin/main` 51429e9). Only the tracker merges to main.

## Slices (feature-branch-chain)
| PR | Branch | Targets | Tasks |
|----|--------|---------|-------|
| Tracker (draft, no merge) | `feature/personal-backend` | `main` | feature doc only |
| 1 | `feature/personal-backend-01-schema` | tracker | E1 (93 lines) |
| 2 | `feature/personal-backend-02-dtos` | PR 1 branch | E2a DTOs + DTO spec (254 lines) |
| 3 | `feature/personal-backend-03-service` | PR 2 branch | E2b CRUD service + spec (428 lines, slightly over 400: service spec is 291 lines of tests; no cohesive smaller split, size:exception recommended if reviewers object) |
| 4 | `feature/personal-backend-04-rules` | PR 3 branch | E3 (501 lines: 146 service + 355 tests; over 400, size:exception recommended or accept as test-heavy) |
| 5 | `feature/personal-backend-05-controller` | PR 4 branch | E4 |
| 6 | `feature/personal-backend-06-audit-e2e-docs` | PR 5 branch | E5 |

Re-sliced on 2026-10-02 after E2 landed at 682 lines (original plan had 4 PRs).

## Tasks
- [x] E1 Schema + entity: add 7 columns to `tbl_empleado` in `init.sql` (idempotent ALTER, partial unique index on DPI) and map them in `EmployeeEntity`; test.
- [x] E2 DTOs + service: Create/Update/Query/Response DTOs (DPI required, 13 digits); `PersonalService` create, findAll (filters: search, status, roleId), findOne, update, remove (physical delete); unit tests.
- [x] E3 Business rules: 409 on duplicate email/DPI (+23505 fallback), role must exist and be active -> 400, cannot delete yourself, delete blocked by FK -> 409 with "deactivate instead" message; unit tests. The licence is not one of the rules: it is optional for every role.
- [ ] E4 Controller + module + wiring: `personal/empleados` routes with `@Permissions("EMPLEADOS_PERFILES_ADMINISTRAR")`, Swagger docs, `PersonalModule` imported in `AppModule`; controller tests.
- [ ] E5 Audit + e2e + docs: audit entries (module "personal") if the audit contract allows, e2e happy/forbidden paths, `apps/api/src/personal/README.md`.

## Acceptance criteria
- Operator with `EMPLEADOS_PERFILES_ADMINISTRAR` can create, list (filtered), read, update, delete employees and toggle their status; other roles get 403.
- Missing DPI -> 400; duplicate email or DPI -> 409; unknown/inactive role -> 400/404 with a clear message. A missing, empty or whitespace licence is accepted for every role, including PILOTO.
- Deleting an employee with history -> 409 (not a 500); deleting one without history removes the row.
- A newly created ACTIVO employee can log in (existing login path unchanged).
- `npm test -w @transmetro/api` has no new failures and `npm run build -w @transmetro/api` passes.

## Progress / evidence
- 2026-10-02: feature doc created; exploration done (pattern: `infrastructure/parada`; seed grants the permission to OPERADOR_CENTRAL and ADMINISTRADOR_SISTEMA; 7 tables FK to `tbl_empleado`).
- 2026-10-02: user decisions applied (hard delete, DPI mandatory, licence mandatory for PILOTO, feature-branch-chain).
- 2026-10-02: user reversed the licence decision (optional for every role) while the branch was still local and unpushed; the rule was rewritten out of E3 rather than shipped and reverted later.

- 2026-10-02 E1 done, commit `51f7edc` on `feature/personal-backend-01-schema` (+93 lines: init.sql 16, entity 21, spec 56). Checks: `npm test -w @transmetro/api -- employee.entity` 15/15; full `npm test -w @transmetro/api` 37/37 suites, 432/432 tests (writer); `npm run build -w @transmetro/api` passed (writer); focused test re-run by parent after amend: 15/15. Not run: `init.sql` against a real database (covered later by E5 e2e). RDD: off (global), no native review.
- 2026-10-02 E2 done as two commits: `4e0e1c4` DTOs (+254, branch `-02-dtos`) and `f5b22dc` CRUD service (+428, branch `-03-service`). Checks (writer, before the commit split): `npm test -w @transmetro/api -- personal` 2 suites / 29 tests; full suite 39 suites / 461 tests; `npm run build -w @transmetro/api` ok. Parent read the service in full. Deviations accepted: `update` ignores explicit `null` for name/status/dpi/email/roleId (PartialType's `@IsOptional` lets null through validation); `toEmployeeResponse` lives in `personal.service.ts`; non-numeric ids -> 404; search escapes LIKE wildcards. Known gap until E3: duplicate email/DPI would surface as 500.
- Running authored count: ~775 lines (E1 93 + E2 682). Forecast raised to ~1,100 total.
- 2026-10-02 E3 done, commit `3860fec` on `feature/personal-backend-04-rules` (+437/-15 across 3 files). **History was rewritten before the push**, so the licence rule an earlier local attempt had introduced was dropped from the commit instead of being added and then removed: the rule never reaches review and no revert commit is needed. Checks after the removal: `npm test -w @transmetro/api -- personal` 3 suites / 53 tests; full `npm test -w @transmetro/api` 40 suites / 485 tests, 0 failures; `npm run build -w @transmetro/api` ok. Counts differ from the pre-rewrite figures (3 suites / 58 tests, 40 suites / 490 tests) because the 5 tests asserting a required licence were removed together with the rule. Parent read the service in full. Notes: dedicated `requireActiveRole` (400) instead of `validateForeignKey` (404), called on create and on update only when the role actually changes; uniqueness via `count`; email uniqueness compares lowercase, so a legacy mixed-case stored email would not be detected by the pre-check (DB unique constraint + 23505 fallback still covers exact duplicates).
- Running authored count: ~1,227 lines (E1 93 + E2 682 + E3 452).

## Key learnings
- **Why the licence rule was dropped:** enforcing "PILOTO requires a licence" on *every* update meant a legacy PILOTO with no stored `licencia_emple` could not be renamed, reactivated or have any other single field patched at all — every write re-checked the invariant. While the workforce is still being administered by hand in dev, that blocks exactly the rows that most need attention, so the rule was worse than the problem it solved.
- **Rewriting before the push was the right call, not hiding it.** The branch had never left the machine, so the honest form of the change is a commit that never contained the rule. Shipping it and reverting it in a follow-up would have put a rule in review that the user had already rejected, and would have misrepresented the change as an evolution rather than a correction.
- `licencia_emple` therefore stays a **nullable** column: `@IsOptional()` in the DTO (max 30 chars), no service-level constraint, stored as `NULL` when absent.
- If a licence requirement is ever wanted back, it belongs as a **dedicated transition check** (only when a role changes *to* PILOTO), not as an invariant re-validated on every write — that is the design flaw, not the rule itself.

## Route declaration
- E1: delegated writer (3 files: init.sql, entity, spec; writer trigger). Parent spot-checked diff and re-ran the focused test.
- E2: delegated writer (7 non-trivial files). Parent read the service, split the commit into two work units.

- E3: delegated writer (3 files). Parent read the service in full and re-ran the focused tests.

## Next step
E4 on `feature/personal-backend-05-controller` (branch from `-04-rules`).
