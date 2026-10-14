# Operational alerts (admin-web)

Route `/alerts`, guarded by `AuthenticationGuard requiredModule="operational_alerts"`
and reached from the "Alertas Operativas" landing card. The page picks one view
by permission:

| Permission | Role (seed) | View |
|---|---|---|
| `ALERTAS_UNIDAD_GESTIONAR` | `PILOTO` | `PilotAlertsView`: pick a station of the unit's line (the suggested one is preselected), tap a predefined type, confirm, and follow "Mis alertas" |
| `ALERTAS_ESTACION_GESTIONAR` | `OPERADOR_ESTACION` | `StationAlertsView`: the station's inbox with a pending count; each alert moves forward (Marcar recibida / En atención / Resolver) with an optional observation |
| anything else | e.g. `OPERADOR_CENTRAL` | message: no view for the role in this version |

Both views poll the API every 10 s (`POLL_INTERVAL_MS`); refetches are silent.
Expected empty states (pilot without unit or line, operator without station)
come from the backend error codes in `errors.ts`, not from error banners.

API contract and rules: `apps/api/src/operations/README.md`.
Spec: `odd/tasks/operational-alerts.md`. Tests: `src/test/operational-alerts/`.
