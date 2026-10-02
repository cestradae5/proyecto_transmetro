# Fleet (operator view)

Admin UI for the fleet backend (`/fleet/*`). Route: `/fleet`, module `fleet`.
Mutation controls require the `FLOTA_GESTIONAR` permission; without it the table is read-only.

## Structure
- `index.tsx`: `FleetPage` (composes hooks, table and dialogs)
- `hooks/`: `use-unidades`, `use-asignacion-unidad`, `use-asignacion-piloto`, `use-ubicacion-unidad`, `use-pilotos`, `fleet-errors` (maps backend error class names to Spanish messages)
- `components/unidades/`: form, dialog, table, and the line / pilot / location dialogs
- `permissions.ts`: `hasPermission`

## Backend endpoints used
- `GET/POST /fleet/units`, `GET/PATCH/DELETE /fleet/units/:id` (delete is logical: `FUERA_DE_SERVICIO`)
- `POST/PATCH/DELETE /fleet/units/:unitId/line-assignment`
- `POST/PATCH/DELETE /fleet/units/:unitId/pilot-assignment` (PATCH moves a pilot to `:unitId`)
- `POST/PATCH /fleet/units/:unitId/location` (report / correct, `idLineaParada`)
- `GET /fleet/pilots` (eligible active pilots)
- `GET /infrastructure/lineas`, `GET /infrastructure/lineas/:id/paradas`

## Notes
- The list has no pagination or server-side filtering; search and filters run on the client.
- The pilot self-service view (`my-unit`) is not implemented yet.
