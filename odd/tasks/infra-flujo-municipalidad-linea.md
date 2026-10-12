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
- [ ] T3 API Acceso module (CRUD scoped to parada) + `esEstacion` on parada responses, with specs.
- [ ] T4 Web: tab order Municipalidades -> Lineas -> Paradas -> Parqueos -> Afectaciones; linea form with optional parqueo and municipalidades; parada form with estacion toggle; parqueo form without estacion; tests.
- [ ] T5 Web: Municipalidad CRUD UI and Accesos UI per parada; tests.

## Slices (feature-branch-chain)
- PR #1 `feat/infra-flow-01-schema` -> `feat/infra-flow`: T1
- PR #2 `feat/infra-flow-02-municipalidad` -> `feat/infra-flow-01-schema`: T2
- PR #3 `feat/infra-flow-03-acceso` -> `feat/infra-flow-02-municipalidad`: T3
- Later slices planned as each task's line count is known.

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

## Next step
T3 on `feat/infra-flow-03-acceso` (child of `feat/infra-flow-02-municipalidad`).
