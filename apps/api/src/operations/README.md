# Operations module

Operational alerts, v1: a pilot sends a predefined alert from their unit to a
station of the unit's line, and the operator of that station moves it through
its states. Central users (admin and central operator) see and advance the
alerts of every station. Station -> central alerts, news (`tbl_novedad`) and
`tbl_afectacion_operativa` are not implemented yet.

Spec: `odd/tasks/operational-alerts.md`.

## Endpoints

All routes are under `operations/alerts`, need a Bearer token
(`AuthenticationGuard`) and the permission listed. Ids are strings and dates
are ISO 8601.

| Method | Path | Permission | Result |
|---|---|---|---|
| GET | `my-unit/destinations` | `ALERTAS_UNIDAD_GESTIONAR` | Unit, line and the line's stations, one `suggested` |
| GET | `sent` | `ALERTAS_UNIDAD_GESTIONAR` | Alerts sent by the caller, newest first, max 50 |
| POST | `/` | `ALERTAS_UNIDAD_GESTIONAR` | `{ tipoAlerta, idEstacionDestino }` -> 201 alert |
| GET | `my-station?idLinea=` | `ALERTAS_ESTACION_GESTIONAR` | `{ station, lineas, alerts }` for the caller's station and its `ACTIVA` lines, newest first, max 100; optional `idLinea` narrows to one line |
| PATCH | `:id/status` | `ALERTAS_ESTACION_GESTIONAR` | `{ estado, observacion? }` -> 200 alert |
| GET | `central` | `ALERTAS_OPERATIVAS_GESTIONAR` | `{ lineas: [{ idLinea, numeroLinea, nombreLinea, estaciones: [{ idEstacion, nombreEstacion, unidades: [{ idUnidad, numeroPlaca, alerts }] }] }] }` from the newest 300 alerts |
| PATCH | `central/:id/status` | `ALERTAS_OPERATIVAS_GESTIONAR` | `{ estado, observacion? }` -> 200 alert, any station |

Seeded roles: `PILOTO` has `ALERTAS_UNIDAD_GESTIONAR`; `OPERADOR_ESTACION` has
`ALERTAS_ESTACION_GESTIONAR`; `OPERADOR_CENTRAL` and `ADMINISTRADOR_SISTEMA`
have `ALERTAS_OPERATIVAS_GESTIONAR`.

## Rules

- **Types**: fixed catalog `ACCIDENTE`, `FALLA_MECANICA`, `EMERGENCIA_MEDICA`,
  `INCIDENTE_SEGURIDAD`, `RETRASO`, `UNIDAD_LLENA` (`alerta.constants.ts`).
  Anything else -> 400.
- **Origin and author**: the unit comes from the caller's
  `tbl_asignacion_piloto` row and the author from the token; the body cannot
  set them. Pilot without unit -> 404, unit without line -> 404.
- **Line**: every alert stores the line assigned to the unit when it was sent
  (`tbl_alerta.id_linea`) and returns it as `linea` (`null` only for legacy
  alerts of units that had no line when the column was added).
- **Destinations**: stations with an `ACTIVA` `tbl_estacion_linea` link to the
  unit's line, in route order of the station's stop on that line (stations
  whose stop is not on the line go last). The suggested one is the closest to
  the last reported stop (`id_linea_parada_actual`); on a tie, the one ahead;
  without a reported stop, the first. A destination outside this list -> 400.
- **States**: `PENDIENTE` -> `RECIBIDA` -> `EN_ATENCION` -> `RESUELTA`, forward
  only (skipping is allowed). Same or earlier state -> 409. Each change locks
  the alert row (`FOR UPDATE`), updates `estado_alerta` and
  `fecha_actualizacion`, and writes one `tbl_historial_estado` row with the
  operator and the optional `observacion` (max 500), all in one transaction.
- **Scoping**: an operator only sees and updates alerts addressed to their
  `ACTIVA` `tbl_asignacion_estacion` station AND sent from a line that is
  `ACTIVA` on that station (`tbl_estacion_linea`). The operator's lines are
  the station's lines; there is no operator-line data. Removing or
  deactivating a line of the station hides its alerts. Another station's
  alert, or one from a line the station no longer has -> 404 (not 403), so
  ids cannot be probed. Operator without station -> 404.
- **Line filter**: `my-station` returns the station's `ACTIVA` `lineas` and
  accepts `?idLinea=`; filtering is server side so a busy line cannot push
  another one out of the 100-alert limit. A line that is not `ACTIVA` on the
  station returns `alerts: []`; an empty value means all lines.
- **Observations**: every alert carries `observaciones`, the
  `tbl_historial_estado` rows with a non-blank observation, oldest first,
  each `{ estadoNuevo, observacion, fechaCambio, autor }`. They come with the
  alert, so the pilot (`sent`), the station operator and central users see
  them; who sees which alert is unchanged.
- **Central view**: alerts are grouped line -> station -> unit, under the
  line stored on the alert; alerts without line go to a last group with
  `idLinea: null` and `nombreLinea: "Sin línea"`. Lines sort by number,
  stations by name, units by plate, alerts newest first.
- **Central transitions**: `central/:id/status` applies the same forward-only
  rules, row lock and history row (author = caller) as the station route,
  without station or line scoping. Unknown alert -> 404.

- **Audit log**: every successful send and state change writes one
  `tbl_bitacora` row in the same transaction (module `operations`, entity
  `alerta` + id, result `EXITOSO`, author = caller). `send_alert` stores
  `{ tipoAlerta, estado, idUnidad, numeroPlaca, idEstacionDestino,
  nombreEstacion, idLinea, numeroLinea }`; `update_alert_status` stores
  `{ estadoAnterior, estadoNuevo, observacion, vista }` with `vista`
  `estacion` or `central`. Rejected requests (400/404/409) write no row.

## Ridership: passenger counting

Specs: `odd/tasks/ridership-capacity.md`, `odd/tasks/parada-ridership.md`,
`odd/tasks/bus-passenger-report.md`. Two separate features:

- **Turnstile** (talanquera): the only way into or out of a PARADA. `ENTRADA`
  adds one person and charges the fare; `SALIDA` removes one.
- **Bus**: only moves people between paradas. At the unit's current stop the
  pilot reports how many got off (bus -> parada) and how many got on
  (parada -> bus).

A station is a parada that also has a `tbl_estacion` row; it uses its
parada's count, capacity and alert. The parada keeps its current count in
`tbl_parada.personas_en_parada`, never below 0, changed in the same
transaction (with the parada row locked) that stores the turnstile event or
the pilot report; events and reports stay as the audit trail.

| Method | Path | Access | Result |
|---|---|---|---|
| POST | `ridership/turnstile` | `X-Turnstile-Key` (no login) | `{ numeroTarjeta, idParada, tipo: "ENTRADA" \| "SALIDA", idempotencyKey? }` -> 201 `{ idEvento, tipo, numeroTarjeta, montoCobrado, saldo, parada, alertaGenerada, idAlerta, repetido }` |
| GET | `ridership/my-unit` | `UNIDAD_ASIGNADA_CONSULTAR` | The caller's unit: `{ idUnidad, numeroPlaca, capacidadPasajeros, aBordo, porcentaje, ultimoReporte }` |
| POST | `ridership/my-unit/stop-report` | `METRICAS_UNIDAD_REPORTAR` | `{ bajaron, subieron }` -> 201 report |
| GET | `ridership/stops/:id` | `ALERTAS_OPERATIVAS_GESTIONAR` | `parada`: `{ idParada, nombreParada, idEstacion, capacidadPasajeros, personasEnParada, porcentaje, alertaActiva }` (`idEstacion` is `null` for a parada that is not a station) |
| GET | `ridership/units/:id` | `ALERTAS_OPERATIVAS_GESTIONAR` | Same shape as `my-unit`, for any unit |
| GET | `ridership/alerts` | `ALERTAS_OPERATIVAS_GESTIONAR` | Capacity alerts `{ idAlerta, estadoAlerta, fechaCreacion, fechaActualizacion, parada: { idParada, nombreParada, idEstacion } }`, newest first, max 100 |

A report is `{ idParadaUnidad, idParada, nombreParada, bajaron, subieron,
aBordo, porcentaje, minutosEsperaExtra, fecha }`; `ultimoReporte` is the
unit's last report or `null`, and `aBordo` is its resulting occupancy (0
without reports).

- **Turnstile access**: answers 404 unless `TURNSTILE_SIMULATOR_ENABLED` is
  exactly `true`; needs `X-Turnstile-Key` equal to `TURNSTILE_API_KEY`
  (missing, wrong or unset key -> 401). CORS allows the header.
- **Fare**: the client never sends the balance. `ENTRADA` needs an `ACTIVA`
  card with `saldo >= 1.00` and charges Q1.00 (`FARE`); `SALIDA` charges
  nothing and ignores the card state. Unknown card -> 404; unknown parada
  -> 404 "Parada con ID <id> no existe."; card not `ACTIVA` or insufficient
  balance -> 409; bad body -> 400. A rejected pass stores no event and
  charges nothing.
- **Events**: every accepted pass is one `tbl_evento_talanquera` row. A
  `SALIDA` at an empty parada is accepted and the count stays at 0.
- **Retries**: optional `idempotencyKey` (8-64 chars `[A-Za-z0-9-]`, else
  400). The same key with the same card, parada and type returns the
  original pass with `repetido: true` (stored charge, current balance and
  parada, `alertaGenerada: false`) and stores or charges nothing; the same
  key with another card, parada or type -> 409. Without a key every pass is
  new (`repetido: false`).
- **Capacity alert (requirement 14)**: after an `ENTRADA`, if the people reach
  `1.5 x tbl_parada.capacidad_pasajeros` and the parada has no capacity alert
  that is not `RESUELTA`, one `tbl_alerta` row is created:
  `CAPACIDAD_ESTACION`, `ESTACION` -> `CENTRAL`, `id_parada_origen` = the
  parada, `id_estacion_origen` = its station or `NULL`, no unit and no
  author (`autor: null`). It moves with `PATCH central/:id/status`; once
  `RESUELTA`, the next entry over the limit creates a new one. It is not part
  of the `central` unit -> station view.
- **Pilot report**: the unit comes from the caller's pilot assignment (none
  -> 404) and the parada from the unit's current reported stop
  (`POST /fleet/units/my-unit/location`; none -> 409 "Reporte primero la
  parada en la que se encuentra la unidad."). `bajaron` and `subieron` are
  integers >= 0 (else 400; `0/0` is valid). First `bajaron` get off: more than
  on board -> 409 "No pueden bajar N pasajeros: la unidad lleva M."; then
  `subieron` get on: over `tbl_unidad.capacidad_pasajeros` -> 409 "La unidad
  quedaría con N pasajeros y su capacidad es M.". Boarding more people than
  the parada counts is accepted; the parada count stays at 0. Each report is
  one `tbl_parada_unidad` row with the reporting pilot (`id_empleado`). A
  rejected report stores nothing.
- **Rule 15**: after the report, on board below 25% of the unit capacity ->
  `minutosEsperaExtra: 5`, else 0.
- **Concurrency**: each request locks its rows (unit, then parada, then
  card) so two passes cannot both create the alert or overdraw a card, and
  two reports of one unit cannot both read the same occupancy.
- **Limits**: nothing empties the bus at the end of a route; the pilot
  reports who gets off.

## Not in v1

- No real-time push: the admin-web screens poll every ~10 s.
