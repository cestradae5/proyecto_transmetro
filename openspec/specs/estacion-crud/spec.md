# Estación (Transit Station) Specification

## Purpose

Estaciones represent major transit hubs where multiple líneas converge. Each estación may optionally reference one parada (via tbl_estacion.id_parada UNIQUE constraint), and can have assigned líneas via tbl_estacion_linea junction table with tipo_punto (PRINCIPAL, CONTROL, APOYO).

## Requirements

### Requirement: Create Transit Station

The system **MUST** accept POST `/api/infrastructure/estaciones` with nombre, latitud, longitud, estado_estacion, and optional id_parada. If id_parada is provided, it **MUST** reference an existing parada; validation failure returns 400. The system **SHALL** enforce parada uniqueness (max one estación per parada). Returns 201 with EstacionResponseDto or 400/401/403.

#### Scenario: Create estación without parada

- GIVEN user has `INFRAESTRUCTURA_GESTIONAR`
- WHEN POST `/api/infrastructure/estaciones` with `{nombre: "Centro Mayor", latitud: 10.5, longitud: -75.4, estado_estacion: "OPERATIVA"}`
- THEN status 201 with complete estación record (auto-generated id, timestamps)

#### Scenario: Create estación with parada FK

- GIVEN parada id=3 exists
- WHEN POST with `{nombre: "Centro Mayor", ..., id_parada: 3}`
- THEN status 201 with estación record, parada relation included

#### Scenario: Reject invalid parada FK

- GIVEN POST with `id_parada: 999` (non-existent)
- WHEN POST `/api/infrastructure/estaciones`
- THEN status 400 with error `PARADA_NOT_FOUND`

#### Scenario: Reject parada already assigned

- GIVEN parada id=3 already assigned to estación id=5
- WHEN POST with `id_parada: 3`
- THEN status 400 with error `ESTACION_PARADA_DUPLICATE`

#### Scenario: Reject unauthenticated

- GIVEN no `INFRAESTRUCTURA_GESTIONAR`
- WHEN POST `/api/infrastructure/estaciones`
- THEN status 403

### Requirement: Retrieve Stations

The system **MUST** expose GET `/api/infrastructure/estaciones` (list, paginated, filterable by estado) and `/{id}` (detail). Detail **SHALL** include related parada (if assigned) and array of assigned líneas via tbl_estacion_linea (with tipo_punto and estado_asignacion). Returns 200 or 404.

#### Scenario: Get single estación with relationships

- GIVEN estación id=2
- WHEN GET `/api/infrastructure/estaciones/2`
- THEN status 200 with estación + parada object (if assigned) + líneas array (id, numero_linea, nombre, tipo_punto)

#### Scenario: Get estación without parada

- GIVEN estación id=5 with id_parada=null
- WHEN GET `/api/infrastructure/estaciones/5`
- THEN status 200 with estación (parada=null), líneas array

#### Scenario: List estaciones with pagination

- GIVEN 40 estaciones
- WHEN GET `/api/infrastructure/estaciones?page=2&limit=10`
- THEN status 200 with 10 records and metadata `{total: 40, page: 2, limit: 10}`

#### Scenario: Filter by estado

- GIVEN estaciones with OPERATIVA and MANTENIMIENTO estados
- WHEN GET `/api/infrastructure/estaciones?estado=OPERATIVA`
- THEN status 200 with only OPERATIVA records

### Requirement: Update Station

The system **MUST** accept PATCH to update nombre, coordinates, estado, and id_parada. If id_parada is updated, the system **MUST** validate the new parada exists and enforce uniqueness. Returns 200 or 400/404.

#### Scenario: Update nombre only

- GIVEN estación id=2 with nombre="Centro Mayor"
- WHEN PATCH with `{nombre: "Centro Mayor Viejo"}`
- THEN status 200, nombre updated, coordinates and parada unchanged

#### Scenario: Update parada FK

- GIVEN estación id=2, id_parada=null
- WHEN PATCH with `{id_parada: 5}`
- THEN status 200, parada assigned (validate existence and uniqueness)

#### Scenario: Reject invalid parada change

- GIVEN estación id=2, PATCH with `id_parada: 999`
- WHEN PATCH `/api/infrastructure/estaciones/2`
- THEN status 400 with error `PARADA_NOT_FOUND`

#### Scenario: Reject parada duplicate on change

- GIVEN estación id=2 attempts to change parada to one already assigned to id=5
- WHEN PATCH `/api/infrastructure/estaciones/2` with `{id_parada: 3}`
- THEN status 400 with error `ESTACION_PARADA_DUPLICATE`

### Requirement: Delete Station

The system **MUST** reject deletion if estación is referenced by tbl_parqueo or tbl_estacion_linea records (409). Soft delete (estado→INACTIVA) recommended. Returns 204 or 409.

#### Scenario: Reject delete if parqueo references

- GIVEN estación id=2, parqueo id=7 with id_estacion=2
- WHEN DELETE `/api/infrastructure/estaciones/2`
- THEN status 409 with error `ESTACION_IN_USE`

#### Scenario: Reject delete if línea assignments exist

- GIVEN estación id=2, tbl_estacion_linea row (id_linea=1, id_estacion=2)
- WHEN DELETE `/api/infrastructure/estaciones/2`
- THEN status 409 with error `ESTACION_IN_USE`

#### Scenario: Soft delete allowed

- GIVEN estación id=2 with no active references
- WHEN DELETE `/api/infrastructure/estaciones/2`
- THEN status 204, estado→INACTIVA (or record archived)

### Requirement: Manage Line Assignments

The system **MUST** expose POST `/api/infrastructure/estaciones/{id}/lineas` to assign a línea with tipo_punto (PRINCIPAL|CONTROL|APOYO) and estado_asignacion. PATCH to update tipo_punto or estado. DELETE to remove assignment. All operations **MUST** validate línea FK.

#### Scenario: Assign línea to estación

- GIVEN estación id=2, línea id=1 exists
- WHEN POST `/api/infrastructure/estaciones/2/lineas` with `{id_linea: 1, tipo_punto: "PRINCIPAL", estado_asignacion: "ACTIVA"}`
- THEN status 201 with junction record created in tbl_estacion_linea

#### Scenario: Update assignment tipo_punto

- GIVEN assignment (estación id=2, línea id=1) with tipo_punto="PRINCIPAL"
- WHEN PATCH `/api/infrastructure/estaciones/2/lineas/1` with `{tipo_punto: "CONTROL"}`
- THEN status 200, tipo_punto updated

#### Scenario: Remove línea assignment

- GIVEN assignment exists
- WHEN DELETE `/api/infrastructure/estaciones/2/lineas/1`
- THEN status 204, junction record deleted

## Validation Rules

| Field | Rule |
|-------|------|
| nombre | 1–120 chars, required |
| latitud/longitud | ±90/180 |
| estado_estacion | VARCHAR 30, required |
| id_parada | FK optional, max 1 per estación (UNIQUE) |
| tipo_punto | IN (PRINCIPAL, CONTROL, APOYO) |
| estado_asignacion | IN (ACTIVA, INACTIVA) |

## API Contract

| Endpoint | Method | Response | Status |
|----------|--------|----------|--------|
| `/api/infrastructure/estaciones` | POST | EstacionResponseDto | 201, 400, 401, 403 |
| `/api/infrastructure/estaciones` | GET | EstacionResponseDto[] | 200, 401 |
| `/api/infrastructure/estaciones/{id}` | GET | EstacionResponseDto | 200, 404, 401 |
| `/api/infrastructure/estaciones/{id}` | PATCH | EstacionResponseDto | 200, 400, 404, 401 |
| `/api/infrastructure/estaciones/{id}` | DELETE | — | 204, 409, 401 |
| `/api/infrastructure/estaciones/{id}/lineas` | POST | — | 201, 400, 404, 401 |
| `/api/infrastructure/estaciones/{id}/lineas/{linea_id}` | PATCH | — | 200, 404, 401 |
| `/api/infrastructure/estaciones/{id}/lineas/{linea_id}` | DELETE | — | 204, 401 |

## Frontend Integration

**List Page**: Table with nombre, coordinates, estado, parada name (link), líneas count, actions.

**Detail Page**: Full estación details, parada link (if assigned), líneas section (table with line name, numero_linea, tipo_punto), assign/unassign line buttons.

**Form Component**: Inputs for nombre, latitud, longitud, estado dropdown, parada lookup (searchable dropdown with lazy load), lineas assignment modal/panel.

