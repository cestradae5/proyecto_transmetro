# Fleet frontend - pilot view

## Objective
Build the pilot self-service view ("Mi unidad") in `apps/admin-web`: a PILOTO sees their assigned unit, its line and current stop, and reports the unit location.

## Problem
A PILOTO has module `fleet` (via `UNIDAD_ASIGNADA_CONSULTAR`), so the landing "Flota" card sends them to the operator `FleetPage`, which calls `FLOTA_GESTIONAR`-only endpoints and gets 403 everywhere. The pilot also cannot load the stops of their line (`/infrastructure/lineas/:id/paradas` requires `INFRAESTRUCTURA_GESTIONAR`) nor the line name.

## Why
Operator view is merged (PR chain #27-#35). Pilot self-service was the explicit follow-up.

## Scope
- Backend `apps/api/src/fleet/**`: pilot-scoped stops endpoint + line name in my-unit response.
- `apps/admin-web/src/features/fleet/**`: pilot hook, page, location report (POST-only mode), error map.
- `apps/admin-web/src/app/app.tsx`, `features/authentication/landing-page.tsx`: route + card routing by permission.
- Tests under `apps/api` specs and `apps/admin-web/src/test/fleet/**`.
- Out of scope: operational alerts, pilot location correction endpoint (repeated POST overwrites).

## Constraints
- Existing endpoints: `GET /fleet/units/my-unit` (`UNIDAD_ASIGNADA_CONSULTAR`, 404 `PilotHasNoUnitAssigned`), `POST /fleet/units/my-unit/location` `{idLineaParada}` (`METRICAS_UNIDAD_REPORTAR`; errors `UnitHasNoLineAssignment` 409, `StopNotFound` 404, `StopNotInAssignedLine` 409).
- Pilot identity only from token (`request.user.employeeId`).
- New `my-unit/*` routes must be registered before `fleet/units/:id` (controller order in `fleet.module.ts`).
- Follow `features/fleet` and `features/infrastructure` patterns; Spanish UI labels, English identifiers.
- TDD: not configured; runner `vitest` (`npm test -w @transmetro/admin-web`), api jest. Ordinary functional checks + builds.
- Delivery strategy: `ask-on-risk`, ~400 authored changed lines per slice (heuristic).

## Tasks
- [x] B4 Backend: `GET /fleet/units/my-unit/stops` (`UNIDAD_ASIGNADA_CONSULTAR`) -> ordered stops of the pilot's assigned line `{idLineaParada, idParada, nombre, orden}`; `my-unit` response adds `nombreLinea`; unit + e2e/spec tests
- [ ] P1 FE: types + `PilotHasNoUnitAssigned`/location errors in `fleet-errors.ts` + `use-mi-unidad` hook (load unit, load stops, report location) + tests
- [ ] P2 FE: `MiUnidadPage` (unit card, line, current stop + report time, empty state when no unit) + report-location dialog (POST-only) + tests
- [ ] P3 FE: route `/fleet/my-unit`; landing card routes PILOTO (no `FLOTA_GESTIONAR`) to it; `/fleet` redirects pilots; tests
- [ ] P4 Full build/test pass + README note

## Route declaration
- B4: delegated writer (controller + service + specs).
- P1-P3: delegated writer per task.

## Progress / evidence
- Branch: `feature/fleet-frontend-pilot`
- B4 commit: `feat(api): add pilot my-unit stops endpoint and line name` (hash cannot be embedded in its own commit; see `git log`).
  - Contract: `GET /fleet/units/my-unit/stops` (`UNIDAD_ASIGNADA_CONSULTAR`) -> `[{ idLineaParada: string, idParada: string, nombre: string, orden: number }]` ordered by `orden`; 404 `PilotHasNoUnitAssigned`, 409 `UnitHasNoLineAssignment`. `idLineaParada` is the value `POST my-unit/location` expects.
  - `UnidadResponseDto.nombreLinea?` filled by `UnidadService.toResponseDto` whenever the unit has a line (GET my-unit, GET /fleet/units, GET /fleet/units/:id).
  - No route collision: `my-unit/stops` is two segments; `AsignacionPilotoController` is already registered before `UnidadController`.
  - `npm run build` (apps/api): OK.
  - `npm test` (apps/api): 5 suites / 25 tests fail, identical on the untouched baseline (authentication guard/foundation/security, parada/estacion service specs); fleet specs 12 suites / 153 tests pass (+8 new tests).
  - `npm run test:e2e -- asignacion-piloto` (with apps/api/.env exported): 19/19 pass. Full `npm run test:e2e`: 50/60 pass; the 10 failures are all in `authentication.e2e-spec.ts` and fail identically on baseline.

## Next step
P1.
