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
| GET | `my-station` | `ALERTAS_ESTACION_GESTIONAR` | `{ station, alerts }` for the caller's station, newest first, max 100 |
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
  `ACTIVA` `tbl_asignacion_estacion` station. Another station's alert -> 404
  (not 403), so ids of other stations cannot be probed. Operator without
  station -> 404.
- **Observations**: every alert carries `observaciones`, the
  `tbl_historial_estado` rows with a non-blank observation, oldest first,
  each `{ estadoNuevo, observacion, fechaCambio, autor }`. They come with the
  alert, so the pilot (`sent`), the station operator and central users see
  them; who sees which alert is unchanged.
- **Central view**: alerts are grouped line -> station -> unit. `tbl_alerta`
  stores no line, so an alert goes under the line currently assigned to its
  unit (`tbl_asignacion_unidad`); units without line go to a last group with
  `idLinea: null` and `nombreLinea: "Sin línea"`. Lines sort by number,
  stations by name, units by plate, alerts newest first.
- **Central transitions**: `central/:id/status` applies the same forward-only
  rules, row lock and history row (author = caller) as the station route,
  without station scoping. Unknown alert -> 404.

## Not in v1

- No `tbl_bitacora` audit rows; the alert trace is `tbl_historial_estado`.
- No real-time push: the admin-web screens poll every ~10 s.
