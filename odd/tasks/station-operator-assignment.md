# Station operator assignment

## Objective
Inside Flota, add a section to assign station operators (role `OPERADOR_ESTACION`) to existing stations, persist and edit that assignment (reassign to another station), and give the operator a view of their own station: stops, line(s), assigned units on those lines, unit status and last reported position.

## Why
`tbl_asignacion_estacion` exists in `database/init.sql` but has no entity or endpoints (only `assignment-scope.repository` reads it). `tbl_estacion_linea` (station <-> line) also has no writer, so a station has no persisted line. User chose to persist both relations (option 2), not derive lines by joins.

## Scope
- Backend `apps/api/src/infrastructure/estacion/**`: station-line link (entity + CRUD under station).
- Backend `apps/api/src/fleet/**`: station-operator assignment (entity, service, controller, DTOs, module wiring) + operator "my station" read endpoint.
- `database/init.sql`: new permission `FLOTA_ESTACION_CONSULTAR` + role mapping to `OPERADOR_ESTACION` (idempotent).
- Frontend `apps/admin-web/src/features/fleet/**`: assignment section (operators <-> stations), operator station view, hooks, types, tests.
- Out of scope: station creation (must already exist), alerts, station fleet requests.

## Constraints / assumptions
- Station must already exist; assignment to a missing station -> error.
- Employee must be active with role `OPERADOR_ESTACION`.
- Assumption (change if wrong): one ACTIVA station per operator; several operators per station allowed. Reassign keeps the row and changes `id_estacion`; unassign sets `INACTIVA` (history kept).
- `fecha_asignacion` has no DB default: set explicitly.
- Audit every mutation via `AuditRepository` like existing fleet services.
- Patterns: follow fleet module (`dataSource.transaction`, domain errors, `DomainExceptionFilter`), admin-web hooks with local state, Spanish UI labels, English identifiers.
- init.sql evolves existing DBs only via idempotent statements: new seeds must use ON CONFLICT DO NOTHING style.
- TDD: not configured (no strict_tdd found); runners: jest (`apps/api`), vitest (`apps/admin-web`). Ordinary functional checks + `tsc`.
- Delivery strategy: `ask-on-risk`, ~400 authored changed lines per slice (planning heuristic only).

## Tasks
- [x] B1 Entities `AsignacionEstacionEntity` + `EstacionLineaEntity` (+ station-line service/controller CRUD under `/infrastructure/stations/:id/lines`) + tests
- [x] B2 Station-operator assignment endpoints `/fleet/station-assignments` (list, POST, PATCH reassign, DELETE unassign) + eligibility lookup + audit + tests
- [x] B3 Permission `FLOTA_ESTACION_CONSULTAR` seed + `GET /fleet/my-station` (station, stops, lines, units with status + position, scoped by active assignment) + tests
- [x] F1 Types + hooks for station assignments and my-station (+ tests)
- [x] F2 Flota "Operadores de estación" section: assign / reassign / unassign (+ station-line management UI) (+ tests)
- [ ] F3 Operator "Mi estación" view (state, stops, lines, units, positions) + route/landing (+ tests)
- [ ] F4 Full build/test pass + docs note

## Route declaration
- B1/B2/B3: delegated writer each (2+ non-trivial files).
- F1-F3: delegated writer each.

## Delivery
- Strategy: ask-on-risk (forecast ~1200+ changed lines -> chained slices per B/F group; chain strategy pending).

## Progress / evidence
- Branch: `feature/station-operator-assignment`
- B1 done, commit f3e5404. Evidence: `npm test -- src/infrastructure/estacion/estacion-linea` 11/11 pass; `nest build` ok. Pre-existing tsc errors in unrelated specs. Review tier: not assessed yet.
- Note: infra services use Nest HttpException (no DomainExceptionFilter, no audit); station-line routes at `/infrastructure/stations/:id/lines`.

- B2 done (see commit below). Evidence: npm test -- src/fleet 16 suites/185 tests pass; nest build ok. Operator reassign = PATCH same row; unassign = INACTIVA; reassign after history inserts new row.

- B3 done. Evidence: npm test -- src/fleet src/authentication 28 suites/306 tests pass; nest build ok. init.sql seed idempotent (ON CONFLICT). Not run: test/assignment-scope.integration-spec.ts (needs DB).

- F1 done. Evidence: vitest fleet 21 files/169 tests pass; tsc -b exit 0. Reuse useEstaciones from infrastructure.

- F2 done. Evidence: vitest fleet 24 files/184 tests pass; tsc -b exit 0. Tabs in FleetPage; operators section lazy-fetches.

## Next step
F3 (Mi estacion view + route + landing).
