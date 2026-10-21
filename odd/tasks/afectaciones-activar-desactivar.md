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

- T1 [S1] DB: `tbl_afectacion.id_linea` + three-way target CHECK in `database/init.sql`, idempotent for existing DBs — route: inline — commit: pending
- T2 [S1-S5] API: entity/DTO/service/controller + audit constants + specs — route: inline — commit: pending
- T3 [S1-S4] admin-web: types, form, table, hook, page wiring + specs — route: inline — commit: pending
- T4 [S1-S5] Independent verification (Risk item 1: schema change) — route: gentle-ai-verify — commit: n/a

## Log

- L1. User: "quieor que las afectaciones sean mas simples, activar o desactivar lineas o paradas/estacion, que solo se tenga el activar y desactivar, que se pueda escribir el motivo, fechas y que desde afectaciones se pueda activar o desactivar. y que quede gaurdado en bitacora"
- L2. User chose "Solo informativa" for fecha fin: dates are recorded only; reverting is manual via a new ACTIVAR afectación.
- L3. Decision: afectaciones become an immutable history (no edit/delete/close), because editing an applied action would desync the target state.
