# Afectaciones: activar / desactivar

Simplify afectaciones to an action (activate/deactivate) on a línea, parada or estación,
applied to the target's real state and recorded in the bitácora. Branch: `feat/afectaciones-activar-desactivar`.

## Specs

- S1. "activar o desactivar lineas o paradas/estacion": an afectación targets exactly one of línea, parada or estación.
- S2. "que solo se tenga el activar y desactivar": the only afectación type is the action `ACTIVAR` or `DESACTIVAR`; the old tipo (TEMPORAL/PERMANENTE/MANTENIMIENTO) and estado selectors are removed from the form.
- S3. "que se pueda escribir el motivo, fechas": the form captures motivo (required), fecha inicio (required) and fecha fin (optional, not before inicio). Dates are informative only (L2): nothing reverts automatically.
- S4. "que desde afectaciones se pueda activar o desactivar": creating an afectación changes the target state in the same transaction (línea → ACTIVA/INACTIVA, parada and estación → ACTIVA/CERRADA). Activating an already active target, or deactivating an already inactive one, is rejected with 409 and changes nothing.
- S5. "y que quede gaurdado en bitacora": every applied afectación writes one bitácora row (module `infrastructure`, action `activate`/`deactivate`, entity = the target) with motivo, fechas, previous and new state and the afectación id.

- S6. "Desactive la linea de villa nueva pero no me la desactivo sigue activa, necesito que tambien se ejecute y cambie el estado de las lienas, paradas/estaciones": deactivating a municipalidad (from Afectaciones or from its own delete/edit-estado in Municipalidades) sets it INACTIVA and cascades to its líneas that are not linked to another ACTIVA municipalidad (L8). Each deactivated línea cascades per S7.
- S7. Deactivating a línea (directly or by S6 cascade) also closes (CERRADA) the paradas and their estaciones that do not belong to any other ACTIVA línea (via tbl_linea_parada or tbl_estacion_linea) (L7).
- S8. Reactivating (ACTIVAR) a municipalidad or línea restores only what its most recent unreverted DESACTIVAR cascaded off, and only items still in the state that cascade set; anything inactive before stays inactive (L8).
- S9. Municipalidad is an afectación target too ("Afecta a" adds Municipalidad) (L8).
- S10. "tambien se pueden editar las afectaciones para poner activas las lineas si asi se desea": an afectación can be edited: acción, motivo and fechas; the target is fixed (L8). Changing the acción applies it: DESACTIVAR→ACTIVAR reverts exactly what that afectación changed (target + cascade, per S8 rules); ACTIVAR→DESACTIVAR applies a fresh deactivation with cascade. Only the most recent afectación of a target may change acción (409 otherwise, L9); motivo/fechas are always editable.
- S11. Bitácora: every application (create, cascade, edit) is audited; the activate/deactivate row's detalle lists the cascaded changes; an edit also writes an `update` row on the afectación with changedFields. Rejected requests write nothing.

## Tasks

- T1 [S1] DB: `tbl_afectacion.id_linea` + three-way target CHECK in `database/init.sql`, idempotent for existing DBs — route: inline — commit: cb1a5e7 (done; verified on scratch DBs: old→new x2, fresh, CHECK rejects two targets)
- T2 [S1-S5] API: entity/DTO/service/controller + audit constants + specs — route: inline — commit: c3b7497 (done; unit 977/977, e2e 9/9 on scratch Postgres)
- T3 [S1-S4] admin-web: types, form, table, hook, page wiring + specs — route: gentle-ai-worker (context backstop) — commit: 2b4b6b2 (done; vitest 705/705, tsc app 0 errors)
- T4 [S1-S5] Independent verification (Risk item 1: schema change) — route: gentle-ai-verify — commit: n/a (done; S1-S5 pass, schema upgrade idempotent and equal to fresh install)
- T5 [S3-S5] Fix verify findings: blank motivo, date-only dates, stale READMEs, rejected-changes-nothing e2e — route: inline — commit: 8d98cc2 (done; unit 981/981, e2e 19/19)
- T6 [S6-S11] DB + API: tbl_afectacion.id_municipalidad (4-way CHECK), tbl_afectacion_cambio, cascade engine, PATCH edit, municipalidad remove/estado routed through the engine, specs + e2e — route: gentle-ai-worker (context backstop) — commit: 81941de (schema), 15cd14c (API) (done; unit 1015/1015, e2e 38/38 on scratch fresh+upgraded DBs)
- T7 [S9-S10] admin-web: Municipalidad target, Editar per row (acción/motivo/fechas), refresh municipalidades too — route: gentle-ai-worker — commit: pending
- T8 [S6-S11] Independent verification (Risk item 1 schema, item 3 removed-then-restored PATCH, item 4 cascade under row locks) — route: gentle-ai-verify — commit: n/a

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
- L7. User (verbatim): "Desactive la linea de villa nueva pero no me la desactivo sigue activa, necesito que tambien se ejecute y cambie el estado de las lienas, paradas/estaciones, tambien se pueden editar las afectaciones para poner activas las lineas si asi se desea, ahsme preguntas para que completes las tareas". Reproduced: no afectación was created; bitácora #8 `remove municipalidad 7` (Villa Nueva → INACTIVA) and #9 `update municipalidad 7` (back to ACTIVA); línea 23 "Linea Villa nueva 1" stayed ACTIVA because municipalidad state never cascaded. Answers: municipalidad deactivation deactivates its líneas; línea deactivation closes "Paradas exclusivas"; editing = "Editar la afectación".
- L8. Answers: shared línea → "Solo las exclusivas"; reactivate → "Lo que se apagó en cascada"; Municipalidad target → "Sí, también en Afectaciones"; editable → "Acción, motivo y fechas". This supersedes L3 (no edit).
- L9. Design: one engine for every activate/deactivate. Municipalidad delete and estado edits create an afectación internally (motivo "Desactivada desde Municipalidades" / "Activada desde Municipalidades", fechaInicio = today). tbl_afectacion_cambio(id_afectacion, entidad_tipo, entidad_id, estado_anterior, estado_nuevo, revertido) records every state change an afectación made, so S8/S10 restore exactly those. Only the latest afectación of a target may change acción. Línea/parada own edit forms are out of scope (unchanged).
- L10. API contract shipped in 15cd14c (T7 must consume exactly this):
  - POST body `{ accion, motivo, fechaInicio, fechaFin?, idMunicipalidad? | idLinea? | idParada? | idEstacion? }` (exactly one id).
  - PATCH `/infrastructure/afectaciones/:id` body `{ accion?, motivo?, fechaInicio?, fechaFin?: 'YYYY-MM-DD'|null }` → 200; target fields stripped.
  - Response (POST/PATCH/GET): `{ idAfectacion, accion, motivo, fechaInicio, fechaFin|null, idMunicipalidad|null, idLinea|null, idParada|null, idEstacion|null, cambios: [{ entidadTipo: 'municipalidad'|'linea'|'parada'|'estacion', entidadId, estadoAnterior, estadoNuevo, revertido }] }`; cambios oldest first; GET newest first.
  - Errors: 400 "Debe proporcionar exactamente uno: idMunicipalidad, idLinea, idParada o idEstacion"; 400 "La fecha de fin no puede ser anterior a la fecha de inicio"; 404 "<Tipo> con ID x no encontrada" / "Afectación con ID x no encontrada"; 409 AFECTACION_SIN_CAMBIO "La <tipo> ya está activa|inactiva"; 409 AFECTACION_NO_ES_ULTIMA "Solo la afectación más reciente de este objetivo puede cambiar de acción"; 409 AFECTACION_ACCION_NO_EDITABLE "Las afectaciones anteriores a activar/desactivar no pueden cambiar de acción". Text in body.message, code in body.error.
  - Municipalidad DELETE and estado PATCH now also change líneas/paradas/estaciones: the page must refresh municipalidades, líneas, paradas, estaciones and afectaciones after those calls and after any afectación create/edit.
  - Known limit: a línea brought down by a municipalidad cascade and reactivated on its own does not restore its paradas (they come back when the municipalidad is reactivated).

