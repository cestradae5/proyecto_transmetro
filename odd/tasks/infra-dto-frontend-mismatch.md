# Infra DTO/frontend field-name & type mismatch fix

## Objective
Fix HTTP 400 errors when creating/editing Parqueo, Linea, and Afectacion from
admin-web, caused by frontend forms sending snake_case/legacy field names and
wrong types (number instead of string for FK ids) that don't match the NestJS
DTOs (camelCase, string ids, specific enum values). Also fix Parqueo.idEstacion
being required in entity/DTO when the DB column allows NULL.

## Why
User report: "Failed to fetch" (CORS, fixed separately) then, after fixing
CORS, "idEstacion should not be empty, idEstacion must be a string" (400) when
saving a Parqueo. Investigation (codegraph_explore + delegated explore agent)
found the same class of mismatch in Linea and Afectacion forms, plus cosmetic
enum-label mismatches in Estacion/Parqueo tables.

## Scope (source of truth: `init.sql` DB schema + NestJS DTOs)
- apps/api/src/infrastructure/parqueo/parqueo.entity.ts
- apps/api/src/infrastructure/parqueo/dto/create-parqueo.dto.ts
- apps/api/src/infrastructure/parqueo/dto/update-parqueo.dto.ts (inherits via PartialType, verify)
- apps/api/src/infrastructure/parqueo/parqueo.service.ts
- apps/admin-web/src/features/infrastructure/types/infrastructure.types.ts
- apps/admin-web/src/features/infrastructure/components/parqueos/parqueo-form.tsx
- apps/admin-web/src/features/infrastructure/components/parqueos/parqueos-table.tsx
- apps/admin-web/src/features/infrastructure/components/lineas/linea-form.tsx
- apps/admin-web/src/features/infrastructure/components/lineas/lineas-table.tsx
- apps/admin-web/src/features/infrastructure/components/afectaciones/afectacion-form.tsx
- apps/admin-web/src/features/infrastructure/components/afectaciones/afectaciones-table.tsx
- apps/admin-web/src/features/infrastructure/components/estaciones/estaciones-table.tsx (cosmetic badge only)

## Out of scope
- Linea-Parada junction endpoints (no frontend exists for them; not touched).
- Estacion idParada uniqueness 500-vs-409 (separate hardening item, not blocking).
- Afectacion entity `date` vs DB `TIMESTAMPTZ` column type drift (separate item).

## Constraints
- TDD: not configured/detected for this repo session (no strict_tdd cache found) — run existing
  jest/vitest specs and `tsc` builds as functional verification, do not skip.
- Keep DB (`init.sql`) as the source of truth for nullability; NestJS DTOs/entities as
  source of truth for field names, types, and enum values (frontend must match backend).
- Do not touch unrelated files already modified on this branch (20+ files from prior work).

## Tasks
- [ ] T1 — Backend: make Parqueo.idEstacion optional (entity `nullable: true`,
      create DTO `@IsOptional() @IsString()` without `@IsNotEmpty`, service only
      validates FK when a value is present).
- [ ] T2 — Frontend types: align `infrastructure.types.ts` field names/id types
      to match the actual API response DTOs (idParqueo/idLinea/idAfectacion,
      string ids where the backend uses string, remove fields the API doesn't return).
- [ ] T3 — Frontend: `parqueo-form.tsx` — send `idEstacion` as string (not
      parseInt), fix estado options to ACTIVO/CERRADO/MANTENIMIENTO.
      `parqueos-table.tsx` — use `tipoParqueo`/`capacidadUnidades`, fix badge to check 'ACTIVO'.
- [ ] T4 — Frontend: `linea-form.tsx` — rename fields to numeroLinea/colorHex/
      tipoRecorrido, send idParqueo as string, restrict hex validation to
      6-digit `#RRGGBB` to match backend. `lineas-table.tsx` — use the renamed
      fields.
- [ ] T5 — Frontend: `afectacion-form.tsx` — rename fields to tipoAfectacion/
      fechaInicio/fechaFin, use backend enums (TEMPORAL/PERMANENTE/MANTENIMIENTO;
      ACTIVA/CERRADA/PENDIENTE default ACTIVA), send idParada/idEstacion as
      string. `afectaciones-table.tsx` — use the renamed fields.
- [ ] T6 — Frontend: `estaciones-table.tsx` — fix badge to check 'ACTIVA' instead of 'ABIERTA'.
- [ ] T7 — Verification: `apps/api` build + relevant jest specs; `apps/admin-web`
      build (tsc -b && vite build) to confirm type alignment compiles clean.
- [ ] T8 — Work-unit commit(s) on current feature branch, scoped only to files
      touched by this fix (conventional commit messages).

## Delivery
Single feature branch already checked out (`feature/hardening-pr4-frontend-tests-docs`,
pre-existing unrelated dirty files). Commit only the files this fix touches.
RDD is on (global); per-commit review runs via the standard ODD/RDD flow after
each work-unit commit.

## Progress

Delegated writer (T1-T6) returned a malformed/empty report (only an Engram
save-error string, no actual task summary). Verified all edits directly by
diffing the working tree instead of trusting the report — see below.

- [x] T1 — Backend Parqueo.idEstacion optional. Verified: entity has
      `nullable: true`, DTO uses `@IsOptional() @IsString()`, service only
      validates FK when `idEstacion` is truthy. `apps/api` build: clean.
      `parqueo.service.spec.ts` + `parqueo.controller.spec.ts`: 22/22 pass.
- [x] T2 — Frontend types aligned to actual response DTOs (idParqueo/idLinea/
      idAfectacion as string, idEstacion as number on Estacion but string on
      Parqueo/Afectacion — matches real backend inconsistency, not introduced
      by this fix). Parqueo/Linea/Afectacion no longer carry fecha_creacion/
      fecha_actualizacion (their response DTOs don't return those).
- [x] T3 — parqueo-form.tsx sends idEstacion as string/undefined; estado
      options fixed to ACTIVO/CERRADO/MANTENIMIENTO. parqueos-table.tsx uses
      tipoParqueo/capacidadUnidades and checks 'ACTIVO'.
- [x] T4 — linea-form.tsx renamed to numeroLinea/colorHex/tipoRecorrido,
      idParqueo sent as string, hex regex tightened to 6 digits.
      lineas-table.tsx uses the renamed fields.
- [x] T5 — afectacion-form.tsx renamed to tipoAfectacion/fechaInicio/
      fechaFin, uses TEMPORAL/PERMANENTE/MANTENIMIENTO and ACTIVA/CERRADA/
      PENDIENTE (default ACTIVA), idParada/idEstacion sent as string.
      afectaciones-table.tsx uses the renamed fields.
- [x] T6 — estaciones-table.tsx badge already checked 'ACTIVA' (pre-existing
      on the branch, no change needed).
- [x] T7 — Verification (run by orchestrator directly, not the writer):
  - `apps/api` build (`nest build`): PASS, clean.
  - `apps/admin-web` build (`tsc -b && vite build`): FAILED initially — 5
    pre-existing *committed* test fixture files (commit 7390fd5, outside
    this task's scope) used the old snake_case/legacy field names and broke
    against the now-corrected types. Fixed as an unplanned but necessary
    extension of T7 (not a new T-item): renamed fixture fields, replaced
    invalid enum literals (e.g. "DESVIO", "PUBLICO", "PRIVADO", "ABIERTA")
    with values that are actually in the backend enums, fixed two
    onSubmit-payload assertions to match real component output (undefined
    instead of null for unset optional FKs), and added a missing
    "selecciona un parqueo" step to the LineaForm success test (idParqueo
    became a required field per the DB NOT NULL constraint). Files touched:
    apps/admin-web/src/test/infrastructure/{parada,estacion,linea,parqueo,
    afectacion}-form.spec.tsx.
  - `apps/admin-web` build after fixture fix: PASS, clean.
  - `apps/admin-web` vitest: 9 files / 46 tests, all PASS.
  - `apps/api` jest (full suite): 25 failed / 239 passed, across
    parada.service.spec.ts, estacion.service.spec.ts, and 3 authentication
    spec files. Confirmed unrelated to this fix: parqueo.* specs pass 22/22
    in isolation; the failing files (parada.service.ts, estacion.service.ts,
    parada.entity.ts, parada-response.dto.ts, validators.ts) were already
    modified/dirty on this branch before this task started (mid-flight
    id-type refactor, number vs string), and the authentication failures are
    against `describe(...RED)`-labeled TDD specs for not-yet-implemented
    Google-auth work, also pre-existing. None touch Parqueo/Linea/Afectacion.

## Deviation from plan
T8 (commit) intentionally NOT done automatically. Every file this fix needed
to touch was already uncommitted/dirty from unrelated prior work on this
branch (`feature/hardening-pr4-frontend-tests-docs`), so `git add <file>`
would stage that unrelated work together with this fix — git has no
finer-than-file granularity to separate them. Flagged to the user instead of
silently bundling an unrelated diff under this fix's commit message.
