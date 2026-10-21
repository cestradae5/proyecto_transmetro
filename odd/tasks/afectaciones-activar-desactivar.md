# Afectaciones: activar / desactivar

Simplify afectaciones to an action (activate/deactivate) on a línea, parada or estación,
applied to the target's real state and recorded in the bitácora. Branch: `feat/afectaciones-activar-desactivar`.

## Specs

- S1. "activar o desactivar lineas o paradas/estacion": an afectación targets exactly one of línea, parada or estación.
- S2. "que solo se tenga el activar y desactivar": the only afectación type is the action `ACTIVAR` or `DESACTIVAR`; the old tipo (TEMPORAL/PERMANENTE/MANTENIMIENTO) and estado selectors are removed from the form.
- S3. "que se pueda escribir el motivo, fechas": the form captures motivo (required), fecha inicio (required) and fecha fin (optional, not before inicio). Dates are informative only (L2): nothing reverts automatically.
- S4. "que desde afectaciones se pueda activar o desactivar": creating an afectación changes the target state in the same transaction (línea → ACTIVA/INACTIVA, parada and estación → ACTIVA/CERRADA). Activating an already active target, or deactivating an already inactive one, is rejected with 409 and changes nothing.
- S5. "y que quede gaurdado en bitacora": every applied afectación writes one bitácora row (module `infrastructure`, action `activate`/`deactivate`, entity = the target) with motivo, fechas, previous and new state and the afectación id.

## Tasks

- T1 [S1] DB: `tbl_afectacion.id_linea` + three-way target CHECK in `database/init.sql`, idempotent for existing DBs — route: inline — commit: cb1a5e7 (done; verified on scratch DBs: old→new x2, fresh, CHECK rejects two targets)
- T2 [S1-S5] API: entity/DTO/service/controller + audit constants + specs — route: inline — commit: c3b7497 (done; unit 977/977, e2e 9/9 on scratch Postgres)
- T3 [S1-S4] admin-web: types, form, table, hook, page wiring + specs — route: gentle-ai-worker (context backstop) — commit: 2b4b6b2 (done; vitest 705/705, tsc app 0 errors)
- T4 [S1-S5] Independent verification (Risk item 1: schema change) — route: gentle-ai-verify — commit: n/a (done; S1-S5 pass, schema upgrade idempotent and equal to fresh install)
- T5 [S3-S5] Fix verify findings: blank motivo, date-only dates, stale READMEs, rejected-changes-nothing e2e — route: inline — commit: 8d98cc2 (done; unit 981/981, e2e 19/19)

## Log

- L1. User: "quieor que las afectaciones sean mas simples, activar o desactivar lineas o paradas/estacion, que solo se tenga el activar y desactivar, que se pueda escribir el motivo, fechas y que desde afectaciones se pueda activar o desactivar. y que quede gaurdado en bitacora"
- L2. User chose "Solo informativa" for fecha fin: dates are recorded only; reverting is manual via a new ACTIVAR afectación.
- L3. Decision: afectaciones become an immutable history (no edit/delete/close), because editing an applied action would desync the target state.
- L4. API contract shipped in c3b7497 (T3 must consume exactly this):
  - `POST /infrastructure/afectaciones` body `{ accion: 'ACTIVAR'|'DESACTIVAR', motivo, fechaInicio: 'YYYY-MM-DD', fechaFin?: 'YYYY-MM-DD', idLinea? | idParada? | idEstacion? }` (exactly one id, numeric string). 201 returns the response below. 400 `"Debe proporcionar exactamente uno: idLinea, idParada o idEstacion"` / `"La fecha de fin no puede ser anterior a la fecha de inicio"`; 404 `"Línea|Parada|Estación con ID x no encontrada"`; 409 `"La línea|parada|estación ya está activa|inactiva"`.
  - `GET /infrastructure/afectaciones` → `[{ idAfectacion, accion, motivo, fechaInicio, fechaFin|null, idLinea|null, idParada|null, idEstacion|null }]`, newest first. Legacy rows may carry accion `TEMPORAL` etc.; show it as-is.
  - PATCH / DELETE / `:id/close` no longer exist.
  - Effect: línea → ACTIVA/INACTIVA, parada and estación → ACTIVA/CERRADA. The page must refresh líneas, paradas and estaciones after a successful afectación so their badges update.
- L5. UI design for T3: form = Acción (two radios "Desactivar" default / "Activar"), "Afecta a" type select (Línea / Parada / Estación) + one select of that type's records (option text includes current state), Motivo (required), Fecha inicio (required), Fecha fin (optional, informative; hint text says it does not revert automatically). Server error message is shown in the form. Table = read-only history: Fecha inicio, Fecha fin, Acción badge, Afecta a (type + resolved name, fallback `#id`), Motivo; search by motivo; no Editar/Eliminar. Labels associated via htmlFor/id.
- L6. T4 verify: S1-S5 pass. Minor findings fixed in T5 (whitespace motivo accepted; datetimes accepted for dates; stale READMEs). Advisory kept: the init.sql DO block would also drop a hand-added CHECK mentioning both id_parada and id_estacion (none exists in the repo).
