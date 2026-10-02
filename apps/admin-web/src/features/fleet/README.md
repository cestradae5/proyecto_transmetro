# Fleet (operator + pilot views)

Admin UI for the fleet backend (`/fleet/*`). Module `fleet`.

- `/fleet` — operator view. Mutation controls require `FLOTA_GESTIONAR`; without it the table is read-only. `OperatorOnlyRoute` sends a user who lacks it to `/fleet/my-unit`.
- `/fleet/my-unit` — pilot self-service view (`MiUnidadPage`). Read-only unless the user has `METRICAS_UNIDAD_REPORTAR`.

## Structure
- `index.tsx`: `FleetPage` (composes hooks, table and dialogs)
- `operator-only-route.tsx`: redirects `/fleet` to `/fleet/my-unit` without `FLOTA_GESTIONAR`
- `hooks/`: `use-unidades`, `use-asignacion-unidad`, `use-asignacion-piloto`, `use-ubicacion-unidad`, `use-pilotos`, `use-mi-unidad`, `fleet-errors` (maps backend error class names to Spanish messages)
- `components/unidades/`: form, dialog, table, and the line / pilot / location dialogs
- `components/mi-unidad/`: `MiUnidadPage` and `ReportarUbicacionDialog` (POST-only, pilot-scoped stops)
- `utils/format.ts`: `formatReportDate`, shared by both location views
- `permissions.ts`: `hasPermission`

## Backend endpoints used
- `GET/POST /fleet/units`, `GET/PATCH/DELETE /fleet/units/:id` (delete is logical: `FUERA_DE_SERVICIO`)
- `POST/PATCH/DELETE /fleet/units/:unitId/line-assignment`
- `POST/PATCH/DELETE /fleet/units/:unitId/pilot-assignment` (PATCH moves a pilot to `:unitId`)
- `POST/PATCH /fleet/units/:unitId/location` (report / correct, `idLineaParada`)
- `GET /fleet/pilots` (eligible active pilots)
- `GET /infrastructure/lineas`, `GET /infrastructure/lineas/:id/paradas`

Pilot view (`/fleet/my-unit`) — identity from the token, no unit id:
- `GET /fleet/units/my-unit` (`UNIDAD_ASIGNADA_CONSULTAR`; 404 `PilotHasNoUnitAssigned` is an empty state, not an error; includes `nombreLinea`)
- `GET /fleet/units/my-unit/stops` (ordered stops of the assigned line; 409 `UnitHasNoLineAssignment` yields an empty list)
- `POST /fleet/units/my-unit/location` `{idLineaParada}` (`METRICAS_UNIDAD_REPORTAR`; repeating it overwrites, so the pilot dialog offers no correction action)

## Notes
- The list has no pagination or server-side filtering; search and filters run on the client.
- The pilot view never calls `/infrastructure/lineas*` or any `FLOTA_GESTIONAR` endpoint: pilots have neither `INFRAESTRUCTURA_GESTIONAR` nor fleet-management grants, so both would 403. The line name and the stops come from the pilot-scoped `my-unit` endpoints instead.
- Pilots reach module `fleet` through `UNIDAD_ASIGNADA_CONSULTAR` (see `PERMISSION_TO_MODULE`), which is why the landing Flota card must branch on `FLOTA_GESTIONAR` rather than on the module being present.
