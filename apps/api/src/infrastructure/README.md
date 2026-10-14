# Infrastructure Module (Backend)

## Overview

The Infrastructure module implements the backend CRUD for Transmetro's core
transit entities: **Municipalidad** (municipality), **Parada** (stop),
**Estación** (station), **Acceso** (parada entrance), **Parqueo** (parking
lot), **Línea** (bus line), and **Afectación** (service disruption). It also owns the `tbl_linea_parada`
junction table that models a línea's ordered sequence of paradas, the
`tbl_linea_municipalidad` línea ↔ municipalidad links, and the afectación
"close" workflow.

This document covers the backend (NestJS/TypeORM) implementation. For the
frontend module that consumes these endpoints, see
`apps/admin-web/src/features/infrastructure/README.md`.

## Folder Structure

Each entity follows the same NestJS pattern: `entity → dto → service →
controller`, all registered by a single `infrastructure.module.ts`.

```
infrastructure/
├── parada/
│   ├── parada.entity.ts
│   ├── parada.service.ts (+ .spec.ts)
│   ├── parada.controller.ts (+ .spec.ts)
│   └── dto/
│       ├── create-parada.dto.ts
│       ├── update-parada.dto.ts
│       └── parada-response.dto.ts
├── estacion/            # same shape as parada/
├── parqueo/              # same shape as parada/
├── linea/
│   ├── linea.entity.ts
│   ├── linea-parada.entity.ts        # tbl_linea_parada junction entity
│   ├── linea.service.ts (+ .spec.ts) # includes junction CRUD (addParada,
│   │                                 # listParadas, updateParada, removeParada,
│   │                                 # reorderParadas)
│   ├── linea.controller.ts (+ .spec.ts)
│   └── dto/
│       ├── create-linea.dto.ts
│       ├── update-linea.dto.ts
│       ├── linea-response.dto.ts
│       ├── add-linea-parada.dto.ts
│       ├── update-linea-parada.dto.ts
│       └── reorder-linea-paradas.dto.ts
├── municipalidad/
│   ├── municipalidad.entity.ts
│   ├── municipalidad.service.ts (+ .spec.ts)
│   ├── municipalidad.controller.ts (+ .spec.ts)
│   ├── linea-municipalidad.entity.ts        # tbl_linea_municipalidad junction entity
│   ├── linea-municipalidad.service.ts (+ .spec.ts)
│   ├── linea-municipalidad.controller.ts (+ .spec.ts)
│   └── dto/
│       ├── create-municipalidad.dto.ts
│       ├── update-municipalidad.dto.ts
│       ├── municipalidad-response.dto.ts
│       └── linea-municipalidad.dto.ts
├── acceso/                # sub-resource of parada (/paradas/:id/accesos)
│   ├── acceso.entity.ts
│   ├── acceso.service.ts (+ .spec.ts)
│   ├── acceso.controller.ts (+ .spec.ts)
│   └── dto/
│       ├── create-acceso.dto.ts
│       ├── update-acceso.dto.ts
│       └── acceso-response.dto.ts
├── afectacion/
│   ├── afectacion.entity.ts
│   ├── afectacion.service.ts (+ .spec.ts)  # includes close()
│   ├── afectacion.controller.ts (+ .spec.ts)
│   └── dto/
├── shared/
│   ├── contracts/infrastructure.contracts.ts  # shared response/error shapes
│   ├── filters/domain-exception.filter.ts      # maps domain errors to HTTP
│   ├── validators.ts
│   └── validators/fk-validation.helper.ts       # FK existence checks
└── infrastructure.module.ts
```

## Relations

The creation flow is Municipalidad → Línea → Parada/Estación → Acceso
(`database/init.sql`). A línea can be created before any parqueo, parada or
estación exists.

| Relation | Schema | API behavior |
| --- | --- | --- |
| Línea → Parqueo | `tbl_linea.id_parqueo` nullable FK; one parqueo can serve several líneas | `idParqueo` optional on create/update (`null` clears it); FK validated (404) only when provided; responses return `idParqueo: null` when unset |
| Parqueo | standalone, no FK to estación (`id_estacion` was dropped) | no `idEstacion` field |
| Estación → Parada | `tbl_estacion.id_parada` NOT NULL UNIQUE (1:1 extension of a parada) | `idParada` required on create; unknown parada → 404; parada that already has an estación → 409 `PARADA_ALREADY_HAS_ESTACION`; cannot be cleared to `null` (400) |
| Línea ↔ Parada | `tbl_linea_parada` (ordered N:M) | `/infrastructure/lineas/:id/paradas` |
| Línea ↔ Estación | `tbl_estacion_linea` (N:M) | `/infrastructure/stations/:id/lines`; a línea can be linked only when its route (`tbl_linea_parada`) includes the estación's parada, otherwise 400 `ESTACION_LINEA_NOT_ON_ROUTE` (existing links are not re-validated); `GET .../lines/available` lists the líneas that pass that check and are not linked yet, `{ idLinea, numeroLinea, nombreLinea }` by number. A station operator's líneas are the estación's `ACTIVA` links |
| Línea ↔ Municipalidad | `tbl_linea_municipalidad` (N:M, composite PK) | `/infrastructure/lineas/:id/municipalidades`; unknown línea/municipalidad → 404; duplicate link → 409 `LINEA_MUNICIPALIDAD_DUPLICATE` |
| Acceso → Parada | `tbl_acceso.id_parada` NOT NULL FK | `/infrastructure/paradas/:id/accesos`; the parada comes from the route (no `idParada` in the body, cannot be moved); unknown parada → 404; acceso of another parada → 404 |
| Parada → Estación (derived) | reverse of `tbl_estacion.id_parada` | parada responses expose read-only `esEstacion` and `idEstacion` (`null` when the parada is not an estación); `findAll` resolves them with a single `IN` query; estaciones are still created through `/infrastructure/estaciones` |

`UnidadService` composes a unit's `parqueo` from its línea; when the línea has
no parqueo, `parqueo` is omitted from the unit response.

## Permission Model

Every route in this module is protected by two layers:

1. `@UseGuards(AuthenticationGuard)` at the controller class level — requires
   a valid session/JWT.
2. `@Permissions('INFRAESTRUCTURA_GESTIONAR')` at the **method** level on
   every single endpoint (all infrastructure controllers) — requires the
   caller's role to carry this permission, enforced by the guard reading
   `PERMISSION_TO_MODULE` in `apps/api/src/authentication/authentication.service.ts`.

There is no read-only/write split — `GESTIONAR` (manage) is required even for
`GET` endpoints. This was a deliberate scope decision for PR#1 of the
`infraestructura-hardening` change, not an oversight.

## Routes

Base path: `/infrastructure`. All routes below require
`AuthenticationGuard` + `INFRAESTRUCTURA_GESTIONAR`.

### Municipalidades — `/infrastructure/municipalidades`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Create; `estadoMunicipalidad` defaults to `ACTIVA`; duplicate `nombreMunicipalidad` → 409 `MUNICIPALIDAD_NOMBRE_DUPLICATE` |
| GET | `/` | List all, ordered by `nombreMunicipalidad` |
| GET | `/:id` | Get one |
| GET | `/:id/lineas` | Líneas linked through `tbl_linea_municipalidad`, same shape as `GET /lineas` (`LineaResponseDto`), ordered by `numeroLinea`; one joined query (no N+1); unknown municipalidad → 404 |
| PATCH | `/:id` | Update; renaming to a used name → 409 `MUNICIPALIDAD_NOMBRE_DUPLICATE` |
| DELETE | `/:id` | Soft delete → `INACTIVA` (línea links are kept) |

### Paradas — `/infrastructure/paradas`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Create (response has `esEstacion: false`, `idEstacion: null`) |
| GET | `/` | List all, each with derived `esEstacion`/`idEstacion` |
| GET | `/:id` | Get one, with derived `esEstacion`/`idEstacion` |
| PATCH | `/:id` | Update (body unchanged: no estación fields) |
| DELETE | `/:id?force=true` | Soft delete → `CERRADA`; `force=true` hard-deletes |
| GET | `/:id/accesos` | List the parada's accesos, ordered by `nombreAcceso` |
| POST | `/:id/accesos` | Create an acceso; `tipoAcceso` is `PEATONAL`/`RAMPA`/`ESCALERA`/`ELEVADOR`; `estadoAcceso` defaults to `HABILITADO` |
| GET | `/:id/accesos/:accesoId` | Get one; 404 if the acceso belongs to another parada |
| PATCH | `/:id/accesos/:accesoId` | Update; 404 if the acceso belongs to another parada |
| DELETE | `/:id/accesos/:accesoId` | Soft delete → `DESHABILITADO`; 404 if the acceso belongs to another parada |

### Estaciones — `/infrastructure/estaciones`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Create |
| GET | `/` | List all |
| GET | `/:id` | Get one |
| PATCH | `/:id` | Update |
| DELETE | `/:id?force=true` | Soft delete → `CERRADA`; `force=true` (exactly `"true"`) hard-deletes the row so the parada stops being an estación; rows still referencing it (FK violation `23503`) → 409 `ESTACION_IN_USE` |

### Parqueos — `/infrastructure/parqueos`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Create |
| GET | `/` | List all |
| GET | `/:id` | Get one |
| PATCH | `/:id` | Update |
| DELETE | `/:id` | Soft delete → `CERRADO` |

### Líneas — `/infrastructure/lineas`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Create |
| GET | `/` | List all |
| GET | `/:id` | Get one |
| PATCH | `/:id` | Update |
| DELETE | `/:id` | Soft delete → `INACTIVA` (no `force` param) |
| GET | `/:id/paradas` | List the línea's parada sequence, ordered by `orden` |
| POST | `/:id/paradas` | Add a parada to the sequence (PR#3) |
| PUT | `/:id/paradas/orden` | Bulk reorder, body `{ idsLineaParada: string[] }` (the full sequence; position i → `orden` i + 1; `minutosHastaSiguiente` unchanged); returns the list in the same shape as `GET /:id/paradas`; list with duplicates, missing or foreign ids → 400 `ORDEN_LIST_MISMATCH`; unknown línea → 404. Runs in one transaction with a two-phase update (shift every `orden` above the current max, then write 1..n) because `UNIQUE (id_linea, orden)` is not deferrable and `CHECK (orden > 0)` forbids temporary negatives |
| PATCH | `/:id/paradas/:lineaParadaId` | Update `orden`/minutes of a linea-parada row (PR#3) |
| DELETE | `/:id/paradas/:lineaParadaId` | Remove a parada from the sequence; línea must keep ≥2 paradas (PR#3) |
| GET | `/:id/municipalidades` | List linked municipalidades (`idLinea`, `idMunicipalidad`, `nombreMunicipalidad`) |
| POST | `/:id/municipalidades` | Link a municipalidad, body `{ idMunicipalidad }` → 201; duplicate → 409 |
| DELETE | `/:id/municipalidades/:municipalidadId` | Unlink (hard-deletes the link row) → 204; missing link → 404 |

### Afectaciones — `/infrastructure/afectaciones`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Create |
| GET | `/` | List all |
| GET | `/:id` | Get one |
| PATCH | `/:id/close` | Close: sets `estado=CERRADA`, `fechaFin=now()` (PR#3) |
| PATCH | `/:id` | Update |
| DELETE | `/:id` | Soft delete → `CERRADA` |

## Audit (bitácora)

Every mutation writes exactly one `tbl_bitacora` row inside the same
transaction as the write, so a change and its audit row commit or roll back
together (fleet/personal precedent). A rejected request (400/404/409) writes
no row.

- Writer: `shared/infrastructure-audit.service.ts` (`InfrastructureAuditService.record`).
- Actor: `request.user.employeeId` set by `AuthenticationGuard`, passed by each
  controller as the last service argument (never a route or body param).
- `modulo` is `infrastructure` (shown as "Infraestructura" in the admin web);
  `resultado` is `EXITOSO`; `detalle` holds a small non-PII summary
  (created fields, `changedFields` on update, an identifier on remove).

| Entity type (`entidad_tipo`) | Actions (`accion`) | `entidad_id` |
| --- | --- | --- |
| `municipalidad`, `acceso`, `parqueo`, `parada`, `estacion`, `linea`, `afectacion` | `create`, `update`, `remove` (afectación `close` is an `update`) | the row's id |
| `linea_municipalidad` | `link`, `unlink` | the línea id |
| `estacion_linea` | `link`, `update`, `unlink` | the estación id |
| `linea_parada` | `link`, `update`, `unlink`, `reorder` | the línea id |

Constants: `shared/infrastructure-audit.constants.ts`.

## Known Enum/Schema Gotchas

**Do not assume enums are interchangeable across entities.** Each entity's
`estado` column has its own DB `CHECK` constraint (`database/init.sql`), and
the TypeORM entity enums must match exactly:

| Entity | Enum | Valid values |
| --- | --- | --- |
| `MunicipalidadEntity` | `EstadoMunicipalidad` | `ACTIVA`, `INACTIVA` only |
| `AccesoEntity` | `TipoAcceso` | `PEATONAL`, `RAMPA`, `ESCALERA`, `ELEVADOR` |
| `AccesoEntity` | `EstadoAcceso` | `HABILITADO`, `DESHABILITADO` only |
| `ParadaEntity` | `EstadoParada` | `ACTIVA`, `CERRADA`, `MANTENIMIENTO` |
| `EstacionEntity` | `EstadoEstacion` | `ABIERTA`, `CERRADA`, `MANTENIMIENTO` |
| `ParqueoEntity` | `EstadoParqueo` | `ABIERTO`, `CERRADO`, `MANTENIMIENTO` |
| `LineaEntity` | `EstadoLinea` | **`ACTIVA`, `INACTIVA` only** |
| `LineaEntity` | `TipoRecorrido` | **`CIRCULAR`, `LINEAL` only** (not `IDA_VUELTA`/`DIRECTO`) |
| `AfectacionEntity` | (estado) | `ACTIVA`, `CERRADA`, `PENDIENTE` (spec drift — see below) |

`EstadoLinea` was originally coded as `ACTIVA`/`CERRADA`/`MANTENIMIENTO` (the
same shape as `EstadoParada`) and `TipoRecorrido` as
`IDA_VUELTA`/`DIRECTO`. Both would have violated `tbl_linea`'s `CHECK`
constraint against a real database (create and soft-delete would fail). This
was caught and fixed during PR#3 of `infraestructura-hardening` — **verify
any new Línea-related code against `tbl_linea`'s actual `CHECK` constraint
in `database/init.sql`, not against another entity's enum shape.**

## Testing

Run the full infrastructure suite:

```bash
cd apps/api
npm test -- infrastructure
```

As of this PR (`infraestructura-hardening` PR#4), the suite has **150+
tests passing** across 11 spec files (`*.entity`/`*.service.spec.ts` +
`*.controller.spec.ts` for Parada, Estación, Parqueo, Línea, Afectación).
21 pre-existing failures in `apps/api/src/authentication/*.spec.ts` are
unrelated to this module (confirmed via an empty git diff on that folder
across PR#1–3).

## Known Limitations

Deliberately deferred during `infraestructura-hardening` (tracked here so
future readers aren't surprised — not blocking, just not yet fixed):

1. **Column length drift**: `numeroLinea` is `varchar(10)` in the entity vs
   `varchar(20)` in the DB; `afectacion` date columns are typed `date` in
   TypeORM vs `TIMESTAMPTZ` in the DB (`close()`'s time-of-day may be
   truncated); `tipoAfectacion` is `varchar(20)` vs `varchar(50)` in the DB.
2. **Afectación estado spec drift**: entity/DB use
   `ACTIVA`/`CERRADA`/`PENDIENTE`; the original spec called for
   `ABIERTA`/`EN_REVISION`. No DB `CHECK` constraint exists on this column,
   so it doesn't crash — it's purely a naming mismatch. The frontend
   `afectacion-form.tsx` defaults new records to `'ABIERTA'`, which has no
   matching `<option>` in its own `<select>` — see the frontend test suite's
   `afectacion-form.spec.tsx` for a test documenting this.
3. **Afectación FK immutability**: the spec expects a `400
   CANNOT_CHANGE_LOCATION` error when a `PATCH` tries to change an
   afectación's `idParada`/`idEstacion`. The current `update()` allows the
   change silently.
4. **Junction add validation error shape**: the spec expects `400
   PARADA_NOT_FOUND` when `POST /:id/paradas` references a nonexistent
   parada. The implementation returns `404`, matching the existing FK-error
   convention used elsewhere in this module instead.
5. **`force` hard-delete asymmetry**: `ParadaService.remove()` and
   `EstacionService.remove()` accept a `force` query param for a hard delete;
   `LineaService.remove()` does not expose the same option.
6. **`validateForeignKey` is triplicated with divergent contracts**:
   `shared/validators.ts` (Nest `NotFoundException`, `"… no encontrada"`, FK
   name supplied by the caller, 4 args) and the two byte-identical
   `fk-validation.helper.ts` files under `shared/` and
   `infrastructure/shared/` (domain `NotFoundError`, `"… no existe."`,
   hardcoded `{ id }` primary key, 3 args). The helper in `shared/validators.ts`
   is the only one the services actually use; the other two hardcode `id`,
   which is *not* a primary key on `Parada`/`Estacion`/`Parqueo` (`idParada`/
   `idEstacion`/`idParqueo`), so they only work against entities that really do
   have a plain `id`. All four services import only `shared/validators.ts`; the
   `infrastructure/shared/validators/` copy has no importer at all. Merging them
   is a separate decision — it changes the exception type and message, so it is
   a behavior change, not a refactor.

See the `infraestructura-hardening` SDD change history for the full PR-by-PR
breakdown (PR#1 permissions, PR#2 Parada/Estación/Parqueo tests, PR#3 Línea
junction + Afectación close + enum fix, PR#4 this document + frontend tests).
