# Personal (employee administration)

Admin UI for the Personal backend (`/personal/*`). Module `personnel`.

- `/personal` — full employee CRUD (list with search/status/role filters, create, edit, delete, activate/deactivate). Every endpoint requires `EMPLEADOS_PERFILES_ADMINISTRAR`, so the page is only useful for a user that holds it.

## Routes and permissions

| Aspect | Value |
| --- | --- |
| Route | `/personal`, declared in `app/app.tsx` |
| Route guard | `AuthenticationGuard requiredModule="personnel"` |
| Mutation gate | `EMPLEADOS_PERFILES_ADMINISTRAR` via `permissions.ts` (`canManageEmpleados`) |

Two separate checks, on purpose:

- The **route** only checks the module. A user without `personnel` is sent to `/landing`, an unauthenticated one to `/login`.
- The **mutation controls** (`Nuevo empleado`, the `Acciones` column and both dialogs) check the permission. Without it the roster is fully readable but read-only.

Module `personnel` is derived from `EMPLEADOS_PERFILES_ADMINISTRAR` alone (see `PERMISSION_TO_MODULE` in `apps/api/src/authentication/authentication.service.ts`), so today both checks resolve together; keeping them separate means the read-only page survives a future read-only role that reaches the module by another route.

## Structure

```
personal/
├── index.tsx                        # PersonalPage: hooks, filters, dialogs, status banner
├── permissions.ts                   # EMPLEADOS_PERFILES_ADMINISTRAR + canManageEmpleados
├── hooks/
│   ├── use-empleados.ts             # list (server-side filters) + create/update/delete
│   ├── use-roles.ts                 # GET /personal/roles, once on mount
│   └── personal-errors.ts           # status → Spanish message
├── types/personal.types.ts          # Empleado, PersonalRole, create/update payloads
├── utils/format.ts                  # displayValue (— for null), formatHireDate (DD/MM/YYYY)
└── components/empleados/
    ├── empleados-table.tsx          # rows, status badge, per-row actions
    ├── empleado-dialog.tsx          # modal shell (Escape to close)
    ├── empleado-form.tsx            # create/edit form + manual validation
    └── confirm-delete-dialog.tsx    # alertdialog, 409 → "Desactivar en su lugar"
```

### Hooks

- **`useEmpleados(filters)`** — `GET /personal/empleados` with the current filters. Exposes `items`, `loading`, `error`, `refresh`, `create`, `update`, `delete`.
  - Only the newest request may write state (a `requestId` ref), so a slow response cannot overwrite a newer one.
  - After the first successful load, refetches are silent (`hasLoaded` ref): the table stays mounted instead of flashing the loading state.
  - `create` / `update` / `delete` refetch only on success; on failure they throw a translated `Error` that the caller surfaces.
- **`useRoles()`** — `GET /personal/roles` once on mount. Feeds both the role filter and the form's role select. A failure disables the role filter and makes the create/edit dialog refuse to open, because neither can work without a valid `roleId`.

## Backend endpoints used

- `GET /personal/empleados` — list; optional `search` (case-insensitive on name, email or DPI), `status`, `roleId`. No pagination.
- `POST /personal/empleados` — create (`201`).
- `PATCH /personal/empleados/:id` — edit, and the only way to activate/deactivate (`{ status }`; there is no dedicated activate route).
- `DELETE /personal/empleados/:id` — `204`, **physical** delete.
- `GET /personal/roles` — active roles as `{ id, code, name }`, ordered by name. Used instead of hardcoding `roleId`, which is a bigint string.

All of them are guarded by `AuthenticationGuard` + `EMPLEADOS_PERFILES_ADMINISTRAR`; there is no read-only variant, so a user without the permission would get `403` on every call.

## Form rules

Validation is manual (no schema library), mirroring the API DTOs:

- **Required**: `name`, `email`, `roleId`, `dpi`.
- **DPI**: exactly 13 digits. The input is digits-only (`maxLength={13}`, non-digits stripped on change), so the rule is a length check.
- **Phone**: `/^[0-9+()\-\s]{7,20}$/`.
- **Email**: `^[^\s@]+@[^\s@]+\.[^\s@]+$`, max 254 chars, lowercased before submit.
- **Hire date**: `YYYY-MM-DD`, and must round-trip through `Date` so `2024-02-31` is rejected.
- **Length caps**: name 120, address 255, licence 30, education history and languages 2000.
- **Licence** is optional for every role, `PILOTO` included — the form never requires it.

### Clearing a field

An optional field is sent only when it has a value, or when the user is *clearing* an existing one:

| Field | Resulting PATCH |
| --- | --- |
| optional, filled | the value |
| optional, emptied and previously set | explicit `null` |
| optional, empty and previously empty | omitted |
| `name`, `status`, `dpi` (and `roleId`) | never cleared — clearing is ignored |

`null` is used instead of `""` because the DTO's `@IsOptional()` lets it through validation and the service writes it to the nullable column, whereas `""` fails the `phone` / `hireDate` regexes and would be stored literally for the free-text fields.

## Delete semantics

Delete is a **hard delete**: `DELETE /personal/empleados/:id` removes the row, so it only succeeds for an employee with no dependent rows. When the API refuses with `409`, the confirm dialog shows the backend message verbatim and — for an `ACTIVO` employee — offers `Desactivar en su lugar`, which issues `PATCH { status: "INACTIVO" }` instead.

Retire people; do not delete them.

## Error mapping

`hooks/personal-errors.ts` maps by **HTTP status**, not by a domain code (the Nest default body carries only `{ statusCode, message, error }`):

| Status | Message |
| --- | --- |
| `400` | backend `message`, else `Los datos enviados no son válidos. Revise el formulario.` |
| `401`, `403` | `No tiene permiso para realizar esta acción o su sesión expiró.` |
| `404` | `El empleado no existe o fue eliminado.` |
| `409` | backend `message`, else `La operación genera un conflicto con datos existentes.` |
| other / not an `ApiError` | generic error, or the connection message |

The backend `message` is used verbatim when present (string, or the string entries of an array joined with `. `), which is why the duplicate-email and deactivate-instead texts reach the user unchanged. A non-`ApiError` (a thrown `TypeError`, typically a network failure) is reported as a connection problem rather than a server error.

## Testing

```bash
# unit + component (vitest)
npm test -w @transmetro/admin-web -- --run personal

# end to end (playwright, needs the production build first)
npm run build -w @transmetro/admin-web
cd apps/admin-web && npx playwright test tests/personal
```

The e2e suite needs neither a backend nor a database: it seeds the session through `localStorage` (`transmetro_token` / `transmetro_user`) and fulfils every `/personal/*` call with `page.route()`. See `apps/admin-web/tests/personal/personal.md`.

## Known limitations / follow-ups

1. `Desactivar en su lugar` is offered after **any** failed delete of an `ACTIVO` employee, not just the "has history" case. `ConfirmDeleteDialog` only knows *that* the delete failed, so a self-delete `409` (`No puede eliminar su propio usuario`) or a `404` also shows a shortcut that cannot help. Gating it on the message, or having the API return a machine-readable code, would fix it.
2. Clearing an optional field relies on the API accepting an explicit `null`, which is implicit behaviour of `@IsOptional()` on `PartialType(CreateEmployeeDto)`. It is documented in neither the Swagger spec nor the API README, so it could change without warning.
3. The list endpoint has no pagination, so the table renders the whole roster. Fine for the current headcount; it will need server-side paging before the roster grows.