# Personal Module (Backend)

## Overview

The Personal module is the administrative CRUD for `tbl_empleado`: the
employee roster behind Transmetro's admin console. It exists because login is
Google-by-email — an employee must already exist in `tbl_empleado` before they
can sign in — yet nothing in the API could create, edit or retire one.

It also owns the HR profile fields added by task E1 (phone, DPI, hire date,
address, driving licence, education history, languages), the business rules
that keep the roster consistent, and the audit trail for every mutation.

Code lives in `apps/api/src/personal/`; the schema's single source of truth
stays `database/init.sql`.

## Folder Structure

```
personal/
├── dto/
│   ├── create-employee.dto.ts (+ .spec.ts)   # name, email, roleId, dpi mandatory
│   ├── update-employee.dto.ts                # PartialType(CreateEmployeeDto)
│   ├── query-employees.dto.ts                # search / status / roleId filters
│   ├── employee-response.dto.ts              # response shape (role relation inlined)
│   └── role-response.dto.ts                  # { id, code, name } for GET /personal/roles
├── personal.service.ts (+ .spec.ts)          # CRUD, business rules, audit
├── personal.rules.spec.ts                    # rule-focused spec (E3)
├── personal.controller.ts (+ .spec.ts)       # routes, Swagger, actor extraction
├── personal.constants.ts                     # audit module/action/entity literals
└── personal.module.ts                        # EmployeeEntity + RoleEntity + AuditRepository
```

`PersonalModule` is imported by `AppModule`. It imports `AuthenticationModule`
for `AuditRepository`, which `AuthenticationModule` already exports, and
registers `EmployeeEntity` and `RoleEntity` through `TypeOrmModule.forFeature`.

## Permission Model

Every route is protected by two layers:

1. `@UseGuards(AuthenticationGuard)` at the controller class level — a valid
   JWT is required.
2. `@Permissions("EMPLEADOS_PERFILES_ADMINISTRAR")` on **every** method. There
   is no read-only variant: even `GET` requires the administrative permission.

`database/init.sql` grants `EMPLEADOS_PERFILES_ADMINISTRAR` to
`OPERADOR_CENTRAL` and to `ADMINISTRADOR_SISTEMA` (the latter receives every
existing permission via a `CROSS JOIN`). `PILOTO`, `GUARDIA` and
`OPERADOR_ESTACION` do not have it, so any of them gets `403` on every route.

The permission literal in the controller is duplicated from the seed on purpose
— the guard compares a string, so there is nothing to import from a table at
compile time.

## Routes

Base path: `/personal/empleados`. All routes require `AuthenticationGuard` +
`EMPLEADOS_PERFILES_ADMINISTRAR`.

| Method | Path | Permission | Request | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/` | `EMPLEADOS_PERFILES_ADMINISTRAR` | `CreateEmployeeDto` | `201` `EmployeeResponseDto` | `400` invalid payload / unknown or inactive role · `401` no or invalid token · `403` missing permission · `409` email or DPI already in use |
| GET | `/` | same | `search`, `status`, `roleId` (all optional) | `200` `EmployeeResponseDto[]` | `400` invalid query value · `401` · `403` |
| GET | `/:id` | same | — | `200` `EmployeeResponseDto` | `401` · `403` · `404` unknown id |
| PATCH | `/:id` | same | `UpdateEmployeeDto` (all fields optional) | `200` `EmployeeResponseDto` | `400` invalid payload / unknown or inactive role · `401` · `403` · `404` · `409` email or DPI already in use |
| DELETE | `/:id` | same | — | `204` no body | `401` · `403` · `404` unknown id · `409` caller is the employee, or the employee has history |

`EmployeeResponseDto` inlines the role (`roleId`, `roleCode`, `roleName`) so
callers never need a second request. Nullable profile fields are always
present as `null` rather than omitted.

### Status is a `PATCH`, not a separate route

There is no `/activate` or `/deactivate`. Both directions go through
`PATCH /:id` with `{ "status": "ACTIVO" | "INACTIVO" }`, which keeps the audit
trail uniform and means a status change is never a privileged side effect
hidden inside `DELETE`.

### Roles lookup: `GET /personal/roles`

Served by `PersonalRolesController` (mounted at `personal/roles`, separate from
`personal/empleados` so it can never be captured by `GET /:id`). Same
protection as the employee routes: `AuthenticationGuard` +
`EMPLEADOS_PERFILES_ADMINISTRAR`.

It returns only **active** roles, ordered by `name`, as
`RoleResponseDto[]` (`{ id, code, name }`; `id` is the bigint string). Clients
use it to populate role selects and filters instead of hardcoding `roleId`.
Errors: `401` no or invalid token, `403` missing permission.

## Business Rules

| Rule | Where | Failure |
| --- | --- | --- |
| `dpi` is mandatory and exactly 13 digits | DTO (`@Matches(/^\d{13}$/)`) on create **and** update | `400` |
| `licenseNumber` is optional for every role, `PILOTO` included | DTO (`@IsOptional()`) on create **and** update; nullable column | — |
| `email` is unique (compared lowercased) | service pre-check + `23505` fallback | `409` |
| `dpi` is unique when present | service pre-check + `23505` fallback + partial unique index | `409` |
| The role must exist **and** be `activo` | service `requireActiveRole` | `400` |
| An employee cannot delete their own account | service `remove` | `409` |
| An employee with history cannot be deleted | service `remove` (catches `23503`) | `409` |

Notable consequences:

- **Delete is a hard delete.** `DELETE /:id` physically removes the row, so it
  is only reachable for employees with no dependent rows. Any row in
  `tbl_sesion`, `tbl_bitacora`, `tbl_asignacion_piloto`, `tbl_asignacion_unidad`,
  `tbl_alerta`, `tbl_novedad`, `tbl_historial_estado` or `tbl_asignacion_estacion`
  makes Postgres reject the delete with a foreign-key violation; the service
  translates it into `409` and tells the caller to set `status: "INACTIVO"`
  instead. Retire people, do not delete them.
- **`null` never clears a mandatory field.** `PartialType` adds `@IsOptional()`,
  which lets an explicit `null` through validation, so the service treats `null`
  as "not provided" for `name`, `status` and `dpi`.
- **Ids are `bigint` strings.** A non-numeric `:id` can never match a row, so it
  answers `404` (read/update/delete) or `400` (`roleId`) without touching the
  database.

## Audit

Every mutation writes one `tbl_bitacora` row inside the same
`dataSource.transaction` as the write itself (fleet precedent), so an audited
mutation and its audit row commit or roll back together.

| Mutation | `modulo` | `accion` | `entidad_tipo` | `entidad_id` | `resultado` |
| --- | --- | --- | --- | --- | --- |
| `POST /` | `personal` | `create` | `empleado` | new employee id | `EXITOSO` |
| `PATCH /:id` | `personal` | `update` | `empleado` | target employee id | `EXITOSO` |
| `DELETE /:id` | `personal` | `remove` | `empleado` | deleted employee id | `EXITOSO` |

`id_empleado` is the **actor** taken from the JWT (`request.user.employeeId`),
not the target. For a delete, `entidad_id` is the route id, because TypeORM
clears the id of a removed entity.

`detalle` never carries PII — no DPI, phone, address, licence, education history
or languages, and no new field values on update:

- `create` → `{ email, roleId, status }` (the email is the login identity and is
  already visible to anyone with this permission)
- `update` → `{ changedFields, status?: { from, to }, roleId?: { from, to } }` —
  field *names* only, plus role and status transitions
- `remove` → `{ email, roleId }`

Literal values live in `personal.constants.ts` and are sized to the
`tbl_bitacora` column limits (module 60, action 80, entity type 60).

## Data Model

The seven columns added to `tbl_empleado` in task E1, all **nullable** so
existing rows (the seeded admin has no DPI) keep working:

| Column | Type | Entity field | Notes |
| --- | --- | --- | --- |
| `telefono_emple` | `VARCHAR(20)` | `phone` | |
| `dpi_emple` | `VARCHAR(13)` | `dpi` | Mandatory at the API level; nullable in the DB for legacy rows |
| `fecha_ingreso_emple` | `DATE` | `hireDate` | `YYYY-MM-DD` in the API |
| `direccion_emple` | `VARCHAR(255)` | `address` | |
| `licencia_emple` | `VARCHAR(30)` | `licenseNumber` | Optional for every role, `PILOTO` included; nullable in the DB |
| `historial_educativo_emple` | `TEXT` | `educationHistory` | Free text, no child table |
| `idiomas_emple` | `TEXT` | `languages` | Free text, no child table |

Plus `idx_empleado_dpi`, a **partial** unique index on `dpi_emple WHERE dpi_emple
IS NOT NULL`: many legacy rows may have `NULL`, but a stored DPI can never
repeat.

```sql
ALTER TABLE tbl_empleado ADD COLUMN IF NOT EXISTS dpi_emple VARCHAR(13);
CREATE UNIQUE INDEX IF NOT EXISTS idx_empleado_dpi
    ON tbl_empleado (dpi_emple) WHERE dpi_emple IS NOT NULL;
```

`ADD COLUMN IF NOT EXISTS` plus `CREATE INDEX IF NOT EXISTS` keeps
`database/init.sql` re-runnable, so applying it to an existing database upgrades
it in place — that is the whole point of the "evolución de bases existentes"
block at the end of the file.

## Testing

```bash
cd apps/api
npm test -- personal            # unit: 4 suites / 82 tests
npm run test:e2e -- personal    # e2e against transmetro_test: 14 tests
```

The e2e suite (`apps/api/test/personal.e2e-spec.ts`) boots the real `AppModule`
against a real Postgres and is the first thing that exercises the seven new
columns against a live database. `npm run test:e2e` hardcodes
`DATABASE_NAME=transmetro_test`; `database/init.sql` must have been applied to
it first:

```bash
# from the repository root (psql resolves database/init.sql relative to the cwd),
# against transmetro_test
psql -d transmetro_test -f database/init.sql
```

Two easy-to-miss prerequisites for that suite:

- `apps/api/.env` must be exported into the shell — `test/jest-e2e.json` has no
  dotenv loader, so without `DATABASE_*` and `JWT_SECRET` the app falls back to
  defaults and the connection fails.
- The spec registers the same global `ValidationPipe({ whitelist: true, transform:
  true })` that `src/main.ts` installs. The pipe lives in `main.ts`, not in
  `AppModule`, so an e2e that only calls `app.init()` runs with no validation at
  all and every "invalid payload" case would reach the service instead of
  answering `400`.

The suite cleans up every employee and audit row it creates, so it is
re-runnable and leaves `transmetro_test` as it found it.