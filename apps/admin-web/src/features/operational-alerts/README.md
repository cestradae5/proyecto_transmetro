# Operational alerts (admin-web)

Route `/alerts`, guarded by `AuthenticationGuard requiredModule="operational_alerts"`
and reached from the "Alertas Operativas" landing card. The page picks one view
by permission, in this order (the admin holds every permission, so the central
view must win):

| Permission | Role (seed) | View |
|---|---|---|
| `ALERTAS_OPERATIVAS_GESTIONAR` | `ADMINISTRADOR_SISTEMA`, `OPERADOR_CENTRAL` | `CentralAlertsView`: every station's alerts grouped line -> station -> unit (units without line under "Sin línea"), total and per-station pending counts, same per-alert actions as the station inbox via `PATCH central/:id/status` |
| `ALERTAS_UNIDAD_GESTIONAR` | `PILOTO` | `PilotAlertsView`: pick a station of the unit's line (the suggested one is preselected), tap a predefined type, confirm, and follow "Mis alertas" |
| `ALERTAS_ESTACION_GESTIONAR` | `OPERADOR_ESTACION` | `StationAlertsView`: the station's inbox with a pending count, only alerts sent from the station's ACTIVA lines; with several lines, chips "Todas" + "Línea N" filter server side (`?idLinea=`, kept while polling), with one line it reads "Atiende: Línea N", with none it warns that no alerts arrive; each alert shows its line and moves forward (Marcar recibida / En atención / Resolver) with an optional observation |
| anything else | e.g. `GUARDIA` with the module | message: no view for the role in this version |

`AlertCard` (state badge, observation, forward-only actions) is shared by the
station and central views. `AlertObservations` lists an alert's
`observaciones` (author, state, date; oldest first) in the pilot's "Mis
alertas" and in every `AlertCard`, so pilots, station operators and central
users all see the notes written on state changes. All views poll the API every 10 s (`POLL_INTERVAL_MS`); refetches are silent.
Expected empty states (pilot without unit or line, operator without station)
come from the backend error codes in `errors.ts`, not from error banners.

API contract and rules: `apps/api/src/operations/README.md`.
Spec: `odd/tasks/operational-alerts.md`. Tests: `src/test/operational-alerts/`.
