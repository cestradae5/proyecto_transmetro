# Parada (Transit Stop) CRUD Specification

## Purpose

Paradas represent physical transit stops where passengers board/alight. This spec defines the complete lifecycle for creating, reading, updating, and deleting transit stops via REST API and admin dashboard.

## Requirements

### Requirement: Create Transit Stop

The system **MUST** accept HTTP POST requests to `/api/infrastructure/paradas` with a JSON payload containing stop name, GPS coordinates (latitude/longitude), and optional metadata. The system **SHALL** validate all required fields, enforce geographic bounds (latitude ±90°, longitude ±180°), and ensure name uniqueness before persisting to `tbl_parada`.

#### Scenario: Create valid parada with all required fields

- GIVEN the user has `INFRAESTRUCTURA_GESTIONAR` permission
- WHEN POST `/api/infrastructure/paradas` with `{ nombre: "Parada Centro", latitud: 10.4, longitud: -75.5, estado: "ACTIVA" }`
- THEN status 201 is returned with full parada object including auto-generated `id` and `created_at`
- AND record is persisted to `tbl_parada`

#### Scenario: Reject duplicate parada name

- GIVEN parada "Parada Centro" already exists
- WHEN POST `/api/infrastructure/paradas` with `{ nombre: "Parada Centro", latitud: 11.0, longitud: -75.0 }`
- THEN status 400 is returned with error `PARADA_NAME_DUPLICATE`

#### Scenario: Reject invalid coordinates

- GIVEN request with `latitud: 95.0` (out of bounds)
- WHEN POST `/api/infrastructure/paradas`
- THEN status 400 is returned with error `INVALID_COORDINATES`

#### Scenario: Reject unauthenticated request

- GIVEN no Authorization header
- WHEN POST `/api/infrastructure/paradas`
- THEN status 401 is returned

#### Scenario: Reject unpermissioned request

- GIVEN user lacks `INFRAESTRUCTURA_GESTIONAR` permission
- WHEN POST `/api/infrastructure/paradas`
- THEN status 403 is returned

### Requirement: Retrieve Transit Stop

The system **MUST** expose GET endpoints to retrieve a single parada by ID or list all paradas with optional filtering and pagination. The system **SHALL** include all fields and return 404 if the requested parada does not exist.

#### Scenario: Get single parada by ID

- GIVEN parada with ID=5 exists
- WHEN GET `/api/infrastructure/paradas/5`
- THEN status 200 is returned with complete parada object (name, coordinates, estado, created_at, updated_at)

#### Scenario: Get parada list with pagination

- GIVEN 25 paradas exist in the database
- WHEN GET `/api/infrastructure/paradas?page=1&limit=10`
- THEN status 200 is returned with array of 10 paradas and metadata `{ total: 25, page: 1, limit: 10 }`

#### Scenario: Filter paradas by estado

- GIVEN paradas exist with estado ACTIVA and INACTIVA
- WHEN GET `/api/infrastructure/paradas?estado=ACTIVA`
- THEN status 200 is returned with only ACTIVA paradas

#### Scenario: Get non-existent parada

- GIVEN no parada with ID=999
- WHEN GET `/api/infrastructure/paradas/999`
- THEN status 404 is returned with error `PARADA_NOT_FOUND`

### Requirement: Update Transit Stop

The system **MUST** accept PATCH/PUT requests to `/api/infrastructure/paradas/{id}` to update one or more fields. The system **SHALL** validate all provided fields, prevent name conflicts, and persist changes without affecting unmodified fields.

#### Scenario: Update parada name

- GIVEN parada ID=5 with nombre="Parada Centro"
- WHEN PATCH `/api/infrastructure/paradas/5` with `{ nombre: "Parada Centro Actualizada" }`
- THEN status 200 is returned with updated record
- AND coordinates and estado remain unchanged

#### Scenario: Update parada estado (state transition)

- GIVEN parada ID=5 with estado="ACTIVA"
- WHEN PATCH `/api/infrastructure/paradas/5` with `{ estado: "MANTENIMIENTO" }`
- THEN status 200 is returned with updated estado
- AND update_at timestamp is refreshed

#### Scenario: Reject name update creating duplicate

- GIVEN parada ID=5 exists, parada ID=6 with nombre="Parada Centro"
- WHEN PATCH `/api/infrastructure/paradas/5` with `{ nombre: "Parada Centro" }`
- THEN status 400 is returned with error `PARADA_NAME_DUPLICATE`

#### Scenario: Reject coordinates outside bounds

- GIVEN PATCH request with `latitud: 91.0`
- WHEN PATCH `/api/infrastructure/paradas/5`
- THEN status 400 is returned with error `INVALID_COORDINATES`

### Requirement: Delete Transit Stop

The system **MUST** support logical deletion (soft delete via estado change to INACTIVA) and optionally hard delete via flag. The system **SHALL** prevent deletion if the parada is referenced by an active línea without removing the foreign key first.

#### Scenario: Soft delete parada (estado → INACTIVA)

- GIVEN parada ID=5 with estado="ACTIVA"
- WHEN DELETE `/api/infrastructure/paradas/5`
- THEN status 204 is returned
- AND record estado is changed to INACTIVA (not removed from DB)

#### Scenario: Hard delete parada (with force flag)

- GIVEN parada ID=5 with estado="INACTIVA" and no active línea references
- WHEN DELETE `/api/infrastructure/paradas/5?force=true`
- THEN status 204 is returned
- AND record is removed from `tbl_parada`

#### Scenario: Reject delete if referenced by active línea

- GIVEN parada ID=5 is part of línea ID=1
- WHEN DELETE `/api/infrastructure/paradas/5`
- THEN status 409 is returned with error `PARADA_IN_USE`

## API Contract

| Endpoint | Method | Request | Response | Status |
|----------|--------|---------|----------|--------|
| `/api/infrastructure/paradas` | POST | CreateParadaDto | ParadaResponseDto | 201 \| 400 \| 401 \| 403 |
| `/api/infrastructure/paradas` | GET | (query: page, limit, estado) | ParadaResponseDto[] | 200 |
| `/api/infrastructure/paradas/{id}` | GET | — | ParadaResponseDto | 200 \| 404 |
| `/api/infrastructure/paradas/{id}` | PATCH | UpdateParadaDto | ParadaResponseDto | 200 \| 400 \| 404 \| 409 |
| `/api/infrastructure/paradas/{id}` | DELETE | (query: force?) | — | 204 \| 409 |

## Data Model

### ParadaResponseDto

```typescript
{
  id: number;
  nombre: string;
  latitud: number;
  longitud: number;
  estado: "ACTIVA" | "INACTIVA" | "MANTENIMIENTO";
  created_at: ISO8601;
  updated_at: ISO8601;
}
```

### Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| `nombre` | Required, 1–100 chars, unique | `PARADA_NAME_REQUIRED`, `PARADA_NAME_TOO_LONG`, `PARADA_NAME_DUPLICATE` |
| `latitud` | Required, ≥ -90 and ≤ 90 | `PARADA_LATITUDE_REQUIRED`, `INVALID_COORDINATES` |
| `longitud` | Required, ≥ -180 and ≤ 180 | `PARADA_LONGITUDE_REQUIRED`, `INVALID_COORDINATES` |
| `estado` | Optional, one of enum | `PARADA_INVALID_ESTADO` |

## Frontend Integration

### List Page (`ParadaListPage.tsx`)

- Display table: ID, nombre, coordinates (display as "10.4, -75.5"), estado, actions
- Filters: estado dropdown
- Search: by nombre (substring match, debounced)
- Pagination: default 10 items/page
- Actions: Create (+), Edit (pencil), Delete (trash)

### Detail Page (`ParadaDetailPage.tsx`)

- Read-only display of all fields
- Link to edit form
- Button to delete
- Related líneas (display list of lines using this parada)

### Form Component (`ParadaForm.tsx`)

- Input fields: nombre, latitud, longitud, estado dropdown
- Validation feedback (inline error messages)
- Submit button (Create/Update)
- Cancel button (return to list)

