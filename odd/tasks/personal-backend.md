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
- **Numero de licencia is mandatory for employees whose role code is `PILOTO`**.
- Delivery: `feature-branch-chain`.

## Assumptions (not asked; revisit if wrong)
- Physical delete is blocked by foreign keys for any employee with history (sessions, audit log, pilot assignment, alerts...). In that case the API answers **409** telling the caller to set `status: INACTIVO` instead. Deactivation/reactivation is done via `PATCH` with `status`.
- Mandatory DPI is enforced by the API (DTO validation), while the DB column stays nullable so legacy rows (the seeded admin has no DPI) keep working. DPI is unique when present and exactly 13 digits.
- The licence rule is enforced in the service on create and on update (including when the role changes to PILOTO), not in the DB.
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
| 1 | `feature/personal-backend-01-schema` | tracker | E1 |
| 2 | `feature/personal-backend-02-service` | PR 1 branch | E2, E3 |
| 3 | `feature/personal-backend-03-controller` | PR 2 branch | E4 |
| 4 | `feature/personal-backend-04-audit-e2e-docs` | PR 3 branch | E5 |

## Tasks
- [ ] E1 Schema + entity: add 7 columns to `tbl_empleado` in `init.sql` (idempotent ALTER, partial unique index on DPI) and map them in `EmployeeEntity`; test.
- [ ] E2 DTOs + service: Create/Update/Query/Response DTOs (DPI required, 13 digits); `PersonalService` create, findAll (filters: search, status, roleId), findOne, update, remove (physical delete); unit tests.
- [ ] E3 Business rules: 409 on duplicate email/DPI, role must exist and be active, licence required when role is PILOTO (create + update + role change), cannot delete yourself, delete blocked by FK -> 409 with "deactivate instead" message; unit tests.
- [ ] E4 Controller + module + wiring: `personal/empleados` routes with `@Permissions("EMPLEADOS_PERFILES_ADMINISTRAR")`, Swagger docs, `PersonalModule` imported in `AppModule`; controller tests.
- [ ] E5 Audit + e2e + docs: audit entries (module "personal") if the audit contract allows, e2e happy/forbidden paths, `apps/api/src/personal/README.md`.

## Acceptance criteria
- Operator with `EMPLEADOS_PERFILES_ADMINISTRAR` can create, list (filtered), read, update, delete employees and toggle their status; other roles get 403.
- Missing DPI -> 400; PILOTO without licence -> 400; duplicate email or DPI -> 409; unknown/inactive role -> 400/404 with a clear message.
- Deleting an employee with history -> 409 (not a 500); deleting one without history removes the row.
- A newly created ACTIVO employee can log in (existing login path unchanged).
- `npm test -w @transmetro/api` has no new failures and `npm run build -w @transmetro/api` passes.

## Progress / evidence
- 2026-10-02: feature doc created; exploration done (pattern: `infrastructure/parada`; seed grants the permission to OPERADOR_CENTRAL and ADMINISTRADOR_SISTEMA; 7 tables FK to `tbl_empleado`).
- 2026-10-02: user decisions applied (hard delete, DPI mandatory, licence mandatory for PILOTO, feature-branch-chain).

## Route declaration
(filled per task as work proceeds)

## Next step
Create PR 1 branch and start E1.
