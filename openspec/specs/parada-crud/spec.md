# Parada (Transit Stop) Specification

## Purpose

Paradas represent physical transit stops where passengers board/alight from vehicles. The system manages a complete CRUD lifecycle: creation of new stops, retrieval with filtering, updates to coordinates/state, and deletion/archival.

## Requirements

### Requirement: Create Transit Stop

The system **MUST** accept HTTP POST requests to `/api/infrastructure/paradas` and persist a new transit stop record to `tbl_parada`. The request **SHALL** include nombre (1–100 chars, unique), latitud (±90), longitud (±180), and optional estado. The system **SHALL** validate all fields, enforce geographic bounds via CHECK constraints, and return 201 (Created) with the complete ParadaResponseDto. Authentication via `INFRAESTRUCTURA_GESTIONAR` permission is required (401/403 otherwise).

#### Scenario: Create valid parada

- GIVEN user has `INFRAESTRUCTURA_GESTIONAR` permission
- WHEN POST `/api/infrastructure/paradas` with `{nombre: "Centro", latitud: 10.4, longitud: -75.5, estado: "ACTIVA"}`
- THEN status 201 returned with id, created_at, updated_at

#### Scenario: Reject duplicate name

- GIVEN "Centro" parada exists
- WHEN POST with `{nombre: "Centro", ...}`
- THEN status 400 with error `PARADA_NAME_DUPLICATE`

#### Scenario: Reject invalid coordinates

- GIVEN POST with `latitud: 91` or `longitud: 181`
- WHEN POST `/api/infrastructure/paradas`
- THEN status 400 with error `INVALID_COORDINATES`

#### Scenario: Reject unauthorized request

- GIVEN no `INFRAESTRUCTURA_GESTIONAR` permission
- WHEN POST `/api/infrastructure/paradas`
- THEN status 403

### Requirement: Retrieve Transit Stops

The system **MUST** expose GET `/api/infrastructure/paradas` (list) and `/paradas/{id}` (single). List **SHALL** support pagination (page, limit) and filtering by estado. Unauthenticated requests return 401. Returns 200 with ParadaResponseDto[] or single ParadaResponseDto; 404 if ID not found.

#### Scenario: Get single parada

- GIVEN parada with id=5 exists
- WHEN GET `/api/infrastructure/paradas/5`
- THEN status 200 with complete parada (id, nombre, latitud, longitud, estado, created_at, updated_at)

#### Scenario: List paradas with pagination

- GIVEN 25 paradas in database
- WHEN GET `/api/infrastructure/paradas?page=1&limit=10`
- THEN status 200 with array of 10 records and metadata `{total: 25, page: 1, limit: 10}`

#### Scenario: Filter by estado

- GIVEN paradas with ACTIVA and CERRADA estados
- WHEN GET `/api/infrastructure/paradas?estado=ACTIVA`
- THEN status 200 with only ACTIVA paradas

#### Scenario: Parada not found

- GIVEN no parada with id=999
- WHEN GET `/api/infrastructure/paradas/999`
- THEN status 404 with error `PARADA_NOT_FOUND`

### Requirement: Update Transit Stop

The system **MUST** accept PATCH/PUT requests to `/api/infrastructure/paradas/{id}` and apply partial updates. The system **SHALL** validate all provided fields, prevent name conflicts, and return 200 on success or 400/404/409 on error. Unmodified fields remain unchanged.

#### Scenario: Update name only

- GIVEN parada id=5
- WHEN PATCH `/api/infrastructure/paradas/5` with `{nombre: "Centro Nuevo"}`
- THEN status 200 with updated nombre, coordinates unchanged

#### Scenario: Reject name conflict

- GIVEN id=5 and id=6 (with nombre="Centro")
- WHEN PATCH `/5` with `{nombre: "Centro"}`
- THEN status 400 with error `PARADA_NAME_DUPLICATE`

#### Scenario: Reject invalid coordinates

- GIVEN PATCH with `latitud: -91`
- WHEN PATCH `/api/infrastructure/paradas/5`
- THEN status 400 with error `INVALID_COORDINATES`

#### Scenario: Change estado

- GIVEN parada with estado="ACTIVA"
- WHEN PATCH with `{estado: "MANTENIMIENTO"}`
- THEN status 200, estado updated, updated_at refreshed

### Requirement: Delete Transit Stop

The system **MUST** support logical deletion (soft delete: estado→INACTIVA) and hard delete via flag. The system **SHALL** reject deletion if the parada is actively referenced by a línea (409 PARADA_IN_USE). Hard delete (`?force=true`) only allowed when no active references exist.

#### Scenario: Soft delete (estado→INACTIVA)

- GIVEN parada id=5
- WHEN DELETE `/api/infrastructure/paradas/5`
- THEN status 204, record marked INACTIVA (not removed from DB)

#### Scenario: Hard delete (force flag)

- GIVEN parada id=5, estado="INACTIVA", no active línea references
- WHEN DELETE `/api/infrastructure/paradas/5?force=true`
- THEN status 204, record removed from database

#### Scenario: Reject delete if in use

- GIVEN parada id=5 is part of línea id=1
- WHEN DELETE `/api/infrastructure/paradas/5`
- THEN status 409 with error `PARADA_IN_USE`

## Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| nombre | 1–100 chars, unique | PARADA_NAME_REQUIRED, PARADA_NAME_DUPLICATE, PARADA_NAME_TOO_LONG |
| latitud | ≥-90, ≤90 | PARADA_LATITUDE_REQUIRED, INVALID_COORDINATES |
| longitud | ≥-180, ≤180 | PARADA_LONGITUDE_REQUIRED, INVALID_COORDINATES |
| estado | IN (ACTIVA, CERRADA, MANTENIMIENTO) | PARADA_INVALID_ESTADO |

## API Contract

| Endpoint | Method | Response | Status |
|----------|--------|----------|--------|
| `/api/infrastructure/paradas` | POST | ParadaResponseDto | 201, 400, 401, 403 |
| `/api/infrastructure/paradas` | GET | ParadaResponseDto[] | 200, 401 |
| `/api/infrastructure/paradas/{id}` | GET | ParadaResponseDto | 200, 404, 401 |
| `/api/infrastructure/paradas/{id}` | PATCH | ParadaResponseDto | 200, 400, 404, 409 |
| `/api/infrastructure/paradas/{id}` | DELETE | — | 204, 409, 401 |

## Frontend Integration

**List Page**: Table (id, nombre, coords, estado) with estado filter, search by nombre (debounced), pagination (default 10/page).

**Detail Page**: Read-only display of all fields, Edit/Delete buttons, related líneas section.

**Form Component**: Inputs for nombre, latitud, longitud, estado dropdown, validation feedback, Save/Cancel buttons.

