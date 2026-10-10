# Infrastructure flow: Municipalidad -> Linea -> Parada/Estacion -> Accesos

## Objective
Invert the infrastructure creation flow so it reads Municipalidad -> Linea -> Parada/Estacion -> Accesos. A linea must be creatable before paradas, estaciones and parqueos.

## Problem / why
Today the FK chain is Parada -> Estacion (`id_parada` optional) -> Parqueo (`id_estacion` optional) -> Linea (`id_parqueo` NOT NULL). A linea cannot exist without a parqueo, and the UI tabs follow that reverse order. Municipalidad and Acceso do not exist.

## Decisions (user)
- Paradas and estaciones can belong to several lineas: keep `tbl_linea_parada` and `tbl_estacion_linea` (N:M).
- Estacion is a 1:1 extension of Parada (option B): `tbl_estacion.id_parada` becomes NOT NULL UNIQUE. The API exposes a derived `esEstacion` on parada; the UI shows it as a toggle. Fleet tables that reference `tbl_estacion` stay untouched.
- Acceso belongs to Parada: `tbl_acceso.id_parada` FK.
- Linea <-> Municipalidad is N:M: new junction `tbl_linea_municipalidad`.
- `tbl_linea.id_parqueo` stays but becomes NULLABLE: linea is created first, parqueo assigned later. One parqueo can serve several lineas (keeps Engram decision #1654). `tbl_parqueo.id_estacion` is dropped.
- `tbl_municipalidad`: id_municipalidad, nombre_municipalidad, departamento, estado_municipalidad (ACTIVA|INACTIVA).
- `tbl_acceso`: id_acceso, id_parada, nombre_acceso, latitud, longitud, tipo_acceso (PEATONAL|RAMPA|ESCALERA|ELEVADOR), estado_acceso (HABILITADO|DESHABILITADO).
- Database is recreated from `database/init.sql` (no migrations). Current data is preserved in a separate `database/seed-current-data.sql`, adapted to the new schema, all tables with data except `tbl_bitacora` and `tbl_sesion`; rows already seeded by `init.sql` use `ON CONFLICT DO NOTHING`. `tbl_municipalidad` and `tbl_linea_municipalidad` start empty.

## Scope
- `database/init.sql`, `database/seed-current-data.sql`
- `apps/api/src/infrastructure/**`, coupled fleet code (`fleet/unidad/unidad.service.ts` must tolerate a linea without parqueo), API specs and SQL fixtures in `apps/api/test/`.
- `apps/admin-web/src/features/infrastructure/**` and its tests.
- Out of scope: merging `tbl_estacion` into `tbl_parada`, fleet schema changes, data migration scripts.

## Constraints
- English identifiers/comments; Spanish UI labels (existing convention).
- TDD: not configured (source: existing ODD docs). Runners: jest (`apps/api`), vitest (`apps/admin-web`), plus `tsc`.
- RDD: off (global). Ordinary checks only.
- Delivery: `ask-on-risk` -> forecast above 400 lines -> chain strategy `feature-branch-chain` (user). Tracker branch `feat/infra-flow` (from `origin/main` 5a37d87); child PR #1 targets the tracker, later children target the previous child branch.
- Forecast: roughly 1500-2500 authored changed lines across the tasks below.

## Tasks
- [x] T1 Schema + seed + API alignment: new tables in `init.sql` (municipalidad, linea_municipalidad, acceso), `tbl_linea.id_parqueo` nullable, drop `tbl_parqueo.id_estacion`, `tbl_estacion.id_parada` NOT NULL; `seed-current-data.sql`; align Parqueo/Linea/Estacion entities, DTOs, services, `unidad.service.ts` null parqueo, specs and SQL fixtures.
- [x] T2 API Municipalidad module: CRUD + link/unlink lineas (`tbl_linea_municipalidad`), with specs.
- [x] T3 API Acceso module (CRUD scoped to parada) + `esEstacion` on parada responses, with specs.
- [x] T4a API: estacion hard delete via `DELETE /infrastructure/estaciones/:id?force=true` (same `force` pattern as parada), 409 `ESTACION_IN_USE` when referenced (FK violation 23503); default DELETE keeps soft close (CERRADA). Decision (user): turning off "Es estación" on the parada form hard-deletes the estacion.
- [x] T4 Web (municipalidades selector on linea form moved to T5): tab order Municipalidades -> Lineas -> Paradas -> Parqueos -> Afectaciones; linea form with optional parqueo and municipalidades; parada form with estacion toggle; parqueo form without estacion; tests.
- [x] T5 Web: Municipalidad CRUD UI and Accesos UI per parada; tests.

## UI rework decisions (user, after T5)
- Infrastructure page stops being tab-based. A "Nueva infraestructura" wizard is the only creation path; existing data is reviewed/edited in a grouped view (Municipalidad -> Líneas -> Paradas y parqueo) that replaces the tabs.
- Wizard steps unlock in order, each step persists to the API when completed:
  1. Municipalidad: pick an existing ACTIVA one or create a new one.
  2. Línea: create it (no parqueo yet) and link it to the step-1 municipalidad.
  3. Paradas y parqueo of that línea: one parqueo per línea (pick existing or create, may stay empty); paradas in one ordered list, each picked from existing or created inline (nombre, coordenadas, "Es estación"), with move up/down and minutos hasta la siguiente.
- Accesos stay out of the wizard (grouped view, "Accesos" action per parada). Afectaciones stay out of the wizard (operational).
- Existing lineas without municipalidad (seeded data) appear under a "Sin municipalidad" group.

## Additional tasks
- [ ] T6 API support: `GET /infrastructure/municipalidades/:id/lineas` (lineas of a municipalidad, avoids N+1 in the grouped view) and a transactional bulk reorder of a línea's paradas (`UNIQUE(id_linea, orden)` is not deferrable and `CHECK (orden > 0)`, so up/down swaps cannot be done with single PATCHes); specs.
- [ ] T7 Web wizard "Nueva infraestructura" (3 steps above) with tests.
- [ ] T8 Web grouped view replacing tabs (municipalidad -> líneas -> paradas/parqueo, "Sin municipalidad" group, edit actions reusing existing dialogs, accesos/afectaciones reachable) with tests.

## Slices (feature-branch-chain)
- PR #1 `feat/infra-flow-01-schema` -> `feat/infra-flow`: T1
- PR #2 `feat/infra-flow-02-municipalidad` -> `feat/infra-flow-01-schema`: T2
- PR #3 `feat/infra-flow-03-acceso` -> `feat/infra-flow-02-municipalidad`: T3
- PR #4 `feat/infra-flow-04-web-forms` -> `feat/infra-flow-03-acceso`: T4
- PR #5 `feat/infra-flow-05-web-municipalidad-acceso` -> `feat/infra-flow-04-web-forms`: T5
- PR #6 `feat/infra-flow-06-wizard` -> `feat/infra-flow-05-web-municipalidad-acceso`: T6 + T7
- PR #7 `feat/infra-flow-07-grouped-view` -> `feat/infra-flow-06-wizard`: T8

## Acceptance criteria
- A linea can be created with no parqueo, no paradas and no estaciones.
- Paradas/estaciones are linked to lineas after the linea exists; a parada can be in several lineas.
- An estacion always belongs to exactly one parada.
- Accesos are created under a parada.
- `init.sql` recreates the DB and `seed-current-data.sql` loads the current data without errors.
- api jest, web vitest and tsc builds pass.

## Route declaration
- T1: delegated writer (trigger: writer, 2+ non-trivial files; preparation read of schema/entities).

## Progress / evidence
T1 — commit `b5c5e23` (28 files, +580/-244 = 824 authored lines, over the 400 budget: schema and API alignment must land together; the 203-line seed is the only separable part).
- apps/api `npx tsc -p tsconfig.build.json --noEmit`: exit 0 (writer + parent spot check)
- apps/api `npm test`: 49 suites, 571 tests passed
- apps/api `npx tsc -p tsconfig.json --noEmit`: 32 pre-existing errors, none in touched files
- Scratch DB `transmetro_t1_check`: init.sql + seed with ON_ERROR_STOP=1 exit 0; row counts match source for all 15 seeded tables; dropped afterwards
- Integration spec on scratch `transmetro_t1_check_test`: 5/5; each e2e suite passes alone (asignacion-unidad 15, asignacion-piloto 19, unidad 6, piloto 3, personal 14, authentication 10, health 1); running all e2e in one jest process fails with "environment torn down" (runner issue, not schema)
- Real `transmetro` DB untouched (still old schema); local `transmetro_test` also needs rebuild before `npm run test:e2e`
- RDD: off -> no review
- Writer decisions: permissions/role links seeded by code (source ids differ from a fresh init.sql); acceso latitud/longitud match parada DECIMAL(10,8)/(11,8) NOT NULL; new tables without ON DELETE like tbl_estacion_linea
- Resolved (user): admin employee (id 1) keeps ON CONFLICT DO NOTHING, so init.sql values win (role ADMINISTRADOR_SISTEMA; current phone/DPI/address are not restored)
- Admin-web mismatches for T4: infrastructure.types.ts (Parqueo.idEstacion, Linea.idParqueo nullable, Estacion.idParada required), parqueo-form, linea-form, estacion-form, parqueos-table

T2 — commit `37a9a14` (16 files, +1263/-7; 644 of those lines are specs; over the 400 budget as one cohesive module).
- Routes: CRUD `/infrastructure/municipalidades` (DELETE = soft delete to INACTIVA), `/infrastructure/lineas/:id/municipalidades` list/link/unlink; all `INFRAESTRUCTURA_GESTIONAR`, no new permission codes
- apps/api `npx tsc -p tsconfig.build.json --noEmit`: exit 0
- apps/api `npm test`: 53 suites, 617 tests passed; parent spot check `npm test -- municipalidad`: 4 suites, 46 passed
- apps/api `npx tsc -p tsconfig.json --noEmit`: same 32 pre-existing errors, none in touched files
- Runtime on scratch `transmetro_t2_check`: services exercised through TypeORM (create/duplicate 409/update/404/link/duplicate link 409/soft delete/unlink); dropped afterwards
- Writer choices: soft delete like siblings (links kept); inactive municipalidades can still be linked; Postgres 23505 also mapped to 409; findAll sorted by name
- Route: delegated writer (writer trigger)

T3 — commit `e567a76` (14 files, +977/-43; ~490 spec lines; over the 400 budget as one cohesive module).
- Routes: `/infrastructure/paradas/:id/accesos` list/create, `/:accesoId` get/patch/delete (soft delete to DESHABILITADO); `INFRAESTRUCTURA_GESTIONAR`
- Parada responses add `esEstacion` and `idEstacion` (single IN lookup in findAll)
- apps/api `npx tsc -p tsconfig.build.json --noEmit`: exit 0
- apps/api `npm test`: 55 suites, 654 tests passed; parent spot check `npm test -- acceso parada`: 4 suites, 58 passed
- apps/api `npx tsc -p tsconfig.json --noEmit`: 27 errors (down from 32; parada spec errors fixed), none in touched files
- Runtime on scratch `transmetro_t3_check`: acceso CRUD, wrong-parada 404, esEstacion before/after estacion; dropped afterwards
- Writer choices: acceso cannot move between paradas; sorted by name; ids returned as strings at runtime (pre-existing number/string mismatch for parada ids left as is)
- Route: delegated writer (writer trigger)

T4a — commit `af5d2c5` (+142/-17). T4 — commit `a9cb20b` (+913/-500; 346 deletions are the removed estaciones tab files).
- Estaciones tab removed: estacion is managed from the parada form ("Es estación" toggle; hard delete runs on Guardar after confirm; 409 ESTACION_IN_USE restores the toggle with a Spanish message). Paradas table shows an "Estación" badge and a "Líneas de la estación" action reusing fleet's EstacionLineasDialog.
- Tabs: Líneas -> Paradas -> Parqueos -> Afectaciones (default Líneas); linea parqueo optional ("Sin parqueo"); parqueo form without estacion; landing text updated
- apps/api `npx tsc -p tsconfig.build.json --noEmit`: exit 0; `npm test`: 55 suites, 660 passed
- apps/admin-web `npx tsc -b`: exit 0; `npx vitest run`: 55 files, 390 passed; parent spot check `npx vitest run src/test/infrastructure`: 12 files, 88 passed
- admin-web has no lint script (not run)
- Known gap: creating a parada with estacion where the estacion save fails, then retrying, creates the parada twice
- Route: delegated writer (writer trigger)

T5 — commit `1753b3a` (24 files, +2249/-13; ~1155 spec lines).
- Tabs: Municipalidades (default) -> Líneas -> Paradas -> Parqueos -> Afectaciones; lineas row action "Municipalidades" (link ACTIVA ones / unlink); paradas row action "Accesos" (CRUD, deactivate)
- apps/admin-web `npx tsc -b`: exit 0; `npx vitest run`: 64 files, 457 passed; parent spot check `npx vitest run src/test/infrastructure`: 21 files, 155 passed
- Skipped: municipalidad names in lineas table (would need N+1 requests; no batch endpoint)
- Route: delegated writer (writer trigger)

## Next step
T6 + T7 on `feat/infra-flow-06-wizard`, then T8. Still pending user decisions: push branches and open the chained PRs (tracker `feat/infra-flow` draft + PR #1..#5), `size:exception` for slices over 400 lines; recreate local `transmetro` and `transmetro_test` from init.sql + seed; e2e full-run teardown issue remains.
