# Fleet frontend - operator view

## Objective
Build the operator-side fleet UI in `apps/admin-web` (`features/fleet`) on top of the finished fleet backend: unit CRUD and status, line assignment, pilot assignment, location report/correction.

## Why
Backend `flota` (REQ-FUNC-007) is merged to main (61/61 tasks). The admin-web has no fleet module yet. Operator first, pilot self-service later.

## Scope
- `apps/admin-web/src/features/fleet/**` (types, hooks, components, page)
- `apps/admin-web/src/app/app.tsx` (route `/fleet`, `requiredModule="fleet"`)
- `apps/admin-web/src/features/authentication/landing-page.tsx` (fleet card + navigate)
- `apps/admin-web/src/test/fleet/**`
- Out of scope: pilot self-service (`my-unit`), backend changes.

## Constraints
- Follow `features/infrastructure` patterns (hooks with local state, `apiClient`, Spanish UI labels, English identifiers).
- Auth: Bearer token; permission `FLOTA_GESTIONAR` (no helper exists, add small `hasPermission`).
- API: no pagination/filter (filter client-side); IDs are strings; `GET /fleet/units` does not fill `idLineaParadaActual` (backend gap).
- Eligible pilots: no backend endpoint -> free-text employee id until backend adds one.
- Operator may lack `INFRAESTRUCTURA_GESTIONAR` -> 403 on `/infrastructure/lineas`; verify role matrix.
- TDD: not configured (no strict_tdd found); runner `vitest` (`npm test -w @transmetro/admin-web`). Ordinary functional checks + `tsc -b`.
- Delivery strategy: `ask-on-risk`, ~400 authored changed lines per slice.
- ~400 changed lines per task is a planning heuristic only.

## API contract (summary)
- `/fleet/units` GET/POST; `/:id` GET/PATCH(status too)/DELETE(logical -> FUERA_DE_SERVICIO)
- `/fleet/units/:unitId/line-assignment` POST/PATCH `{idLinea}`, DELETE 204
- `/fleet/units/:unitId/location` POST(200)/PATCH `{idLineaParada}`
- `/fleet/units/:unitId/pilot-assignment` POST/PATCH `{idEmpleado}`, DELETE 204
- Errors: `{statusCode,message,error}` where `error` = exception class name (e.g. `UnitNotFound`, `DuplicatePlate`, `EnServicioRequiresBothAssignments`).

## Tasks
- [x] F1 Types + `mapFleetError` + `use-unidades` hook (+ tests)
- [x] B1 Backend: GET /fleet/units fills idLineaParadaActual + fechaReporteUbicacion (UnidadService.toResponseDto) + unit test
- [x] F2 Units table/dialog/form (create, edit, status, logical delete) + `/fleet` page + route + landing card
- [x] F3 Line assignment (assign/reassign/unassign) in unit UI using `useLineas`
- [x] B2 Backend: GET /fleet/pilots (FLOTA_GESTIONAR) -> eligible active PILOTO employees {idEmpleado, nombre, idUnidad?} + tests
- [x] F4 Pilot assignment (assign/reassign/unassign), free-text employee id
- [x] F5 Location report/correct using `useLineaParadas`
- [x] B3 Backend+FE: unit response exposes nombreParadaActual; table shows stop name
- [x] F6 Full build/test pass + docs note on backend gaps

## Route declaration
- B2: delegated writer (controller+service+module+specs).
- F1: delegated writer (2+ files); parent reads back and verifies.
- B1: delegated writer (service + spec). Gap 3 (403 on /infrastructure) verified NOT an issue: OPERADOR_CENTRAL has both permissions in database/init.sql.

## Progress / evidence
- Branch: `feature/fleet-frontend-operator`

## Next step

F2 (units table/dialog/form + /fleet page + route + landing card).
