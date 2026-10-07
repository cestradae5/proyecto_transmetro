# User profile

## Objective
Enable the profile page (`/profile`) so it shows the authenticated user's name, email, role, and: station for `OPERADOR_ESTACION`, line for `PILOTO`.

## Why
`ProfilePage` exists but only shows email, employee ID and role code from the JWT. Name and assignment are not in the token and need a DB read.

## Scope
- Backend: new `apps/api/src/profile/` (module, controller `GET /profile`, service, DTO, specs), registered in `AppModule`. Guarded by `PERFIL_PROPIO_CONSULTAR`.
- Frontend: `apps/admin-web/src/features/dashboard/profile-page.tsx` + hook + types + tests.
- Out of scope: editing profile, DB schema changes.

## Constraints / assumptions
- Decision (user): pilot shows its LINE, not a station. Operator shows STATION.
- Operator station: ACTIVA row in `tbl_asignacion_estacion` -> `tbl_estacion`.
- Pilot line: `tbl_asignacion_piloto` -> `tbl_asignacion_unidad.id_linea` -> `tbl_linea`.
- Missing assignment -> field omitted; UI shows "Sin asignar".
- Stateless `dataSource.query` pattern like `EstacionOperadorService`. English identifiers, Spanish UI labels.
- TDD: not configured. Runners: jest (`apps/api`), vitest (`apps/admin-web`). Plus `tsc`.
- Delivery: `ask-on-risk`, small slice (< 400 lines).

## Tasks
- [x] P1 Backend `GET /profile` + service + specs
- [x] P2 Frontend profile page + hook + types + tests
- [x] P3 Full build/test pass (api jest 571 passed, web vitest 374 passed, tsc build configs clean; `tsc -p tsconfig.json` in api has pre-existing errors in untouched spec files)

## Route declaration
- P1+P2: one delegated writer (2+ non-trivial files, trigger: writer).

## Progress / evidence
P1+P2 verification (writer):
- apps/api `npx tsc -p tsconfig.build.json --noEmit`: exit 0
- apps/api `npx tsc -p tsconfig.json --noEmit`: exit 2, pre-existing errors only in other spec/test files (authentication, infrastructure, test/); zero matches for profile/app.module
- apps/api `npm test -- profile`: 2 suites, 8 tests passed
- apps/api `npm test`: 51 suites, 571 tests passed
- apps/admin-web `npx tsc -b`: exit 0
- apps/admin-web `npx vitest run`: 54 files, 374 tests passed
