# Afectación (Operational Disruption) Specification

## Purpose

Afectaciones record operational disruptions (maintenance, incidents, etc.) that impact service at a specific parada or estación. Each disruption is tied to exactly one location via XOR constraint: either parada OR estación, never both or neither.

## Requirements

### Requirement: Create Operational Disruption

The system **MUST** accept POST to `/api/infrastructure/afectaciones` with tipo (VARCHAR 50), motivo (TEXT), fecha_inicio (TIMESTAMPTZ), fecha_fin (optional TIMESTAMPTZ), estado, and exactly one of id_parada or id_estacion (XOR constraint). The system **SHALL** validate date ranges (fecha_fin ≥ fecha_inicio if set) and XOR logic. Returns 201 with AfectacionResponseDto or 400/401/403.

#### Scenario: Create disruption at parada

- GIVEN parada id=5 exists; user has `INFRAESTRUCTURA_GESTIONAR`
- WHEN POST `/api/infrastructure/afectaciones` with `{tipo: "MANTENIMIENTO", motivo: "Reparación de acera", fecha_inicio: "2025-01-15T08:00:00Z", estado: "ABIERTA", id_parada: 5, id_estacion: null}`
- THEN status 201 with complete afectación record

#### Scenario: Create disruption at estación

- GIVEN estación id=3 exists
- WHEN POST with same fields but `id_estacion: 3, id_parada: null`
- THEN status 201 with afectación record

#### Scenario: Reject both locations (XOR violation)

- GIVEN POST with `id_parada: 5, id_estacion: 3`
- WHEN POST `/api/infrastructure/afectaciones`
- THEN status 400 with error `XOR_VIOLATION`

#### Scenario: Reject no location (XOR violation)

- GIVEN POST with `id_parada: null, id_estacion: null`
- WHEN POST `/api/infrastructure/afectaciones`
- THEN status 400 with error `XOR_VIOLATION`

#### Scenario: Reject invalid date range

- GIVEN POST with `fecha_inicio: "2025-01-20T08:00:00Z", fecha_fin: "2025-01-15T08:00:00Z"`
- WHEN POST `/api/infrastructure/afectaciones`
- THEN status 400 with error `INVALID_DATE_RANGE`

#### Scenario: Reject unauthenticated

- GIVEN no `INFRAESTRUCTURA_GESTIONAR` permission
- WHEN POST `/api/infrastructure/afectaciones`
- THEN status 403

### Requirement: Retrieve Disruptions

The system **MUST** expose GET `/api/infrastructure/afectaciones` (list) and `/{id}` (single). List **SHALL** support pagination and filtering by estado, tipo. Detail **SHALL** include related parada or estación object (with full details). Returns 200 or 404.

#### Scenario: Get afectación with parada details

- GIVEN afectación id=7 with id_parada=5
- WHEN GET `/api/infrastructure/afectaciones/7`
- THEN status 200 with afectación + parada object (nombre, coords, estado)

#### Scenario: Get afectación with estación details

- GIVEN afectación id=8 with id_estacion=3
- WHEN GET `/api/infrastructure/afectaciones/8`
- THEN status 200 with afectación + estación object

#### Scenario: List disruptions by estado

- GIVEN afectaciones with ABIERTA and CERRADA estados
- WHEN GET `/api/infrastructure/afectaciones?estado=ABIERTA`
- THEN status 200 with only ABIERTA disruptions

#### Scenario: List disruptions by tipo

- GIVEN afectaciones with MANTENIMIENTO and INCIDENTE tipos
- WHEN GET `/api/infrastructure/afectaciones?tipo=INCIDENTE`
- THEN status 200 with only INCIDENTE records

#### Scenario: List with pagination

- GIVEN 30 afectaciones
- WHEN GET `/api/infrastructure/afectaciones?page=1&limit=15`
- THEN status 200 with 15 records and metadata

### Requirement: Update Disruption

The system **MUST** accept PATCH to `/api/infrastructure/afectaciones/{id}` to update motivo, fecha_fin, and estado. Update **MUST NOT** allow changing location (id_parada/id_estacion). Update **SHALL** validate date ranges. Returns 200 or 400/404.

#### Scenario: Update motivo

- GIVEN afectación id=7
- WHEN PATCH with `{motivo: "Reparación ampliada"}`
- THEN status 200, motivo updated

#### Scenario: Close disruption (set fecha_fin)

- GIVEN afectación id=7 with estado="ABIERTA", fecha_fin=null
- WHEN PATCH with `{estado: "CERRADA", fecha_fin: "2025-01-15T16:00:00Z"}`
- THEN status 200, disruption closed with end time recorded

#### Scenario: Update estado only

- GIVEN afectación id=7 with estado="ABIERTA"
- WHEN PATCH with `{estado: "EN_REVISION"}`
- THEN status 200, estado updated

#### Scenario: Reject location change

- GIVEN PATCH attempt with `{id_parada: 6}` (changing from 5)
- WHEN PATCH `/api/infrastructure/afectaciones/7`
- THEN status 400 with error `CANNOT_CHANGE_LOCATION`

#### Scenario: Reject invalid date update

- GIVEN PATCH with `fecha_fin: "2025-01-10T08:00:00Z"` (before fecha_inicio)
- WHEN PATCH `/api/infrastructure/afectaciones/7`
- THEN status 400 with error `INVALID_DATE_RANGE`

### Requirement: Delete Disruption

The system **SHOULD** allow DELETE to archive/remove a disruption record, or require status change to CERRADA first (business rule TBD). Soft delete recommended. Returns 204 or 400.

#### Scenario: Close before delete

- GIVEN afectación id=7 with estado="ABIERTA"
- WHEN PATCH estado→CERRADA, then DELETE
- THEN PATCH returns 200, DELETE returns 204

## Validation Rules

| Field | Rule |
|-------|------|
| tipo | VARCHAR 50 (e.g., MANTENIMIENTO, INCIDENTE) |
| motivo | TEXT, required |
| fecha_inicio | Required TIMESTAMPTZ |
| fecha_fin | Optional, ≥fecha_inicio if set |
| estado | VARCHAR 30 |
| id_parada/id_estacion | XOR: exactly one NOT NULL |

## API Contract

| Endpoint | Method | Response | Status |
|----------|--------|----------|--------|
| `/api/infrastructure/afectaciones` | POST | AfectacionResponseDto | 201, 400, 401, 403 |
| `/api/infrastructure/afectaciones` | GET | AfectacionResponseDto[] | 200, 401 |
| `/api/infrastructure/afectaciones/{id}` | GET | AfectacionResponseDto | 200, 404, 401 |
| `/api/infrastructure/afectaciones/{id}` | PATCH | AfectacionResponseDto | 200, 400, 404, 401 |
| `/api/infrastructure/afectaciones/{id}` | DELETE | — | 204, 400, 401 |

## Frontend Integration

**List Page**: Table with tipo, motivo (truncated), location (parada/estación name, link), fecha_inicio, estado, actions.

**Detail Page**: Full motivo, dates (start/end), location details (link), estado badge, close/edit buttons.

**Form Component**: Inputs for tipo (dropdown), motivo (textarea), fecha_inicio/fin (date pickers), estado (dropdown), location toggle (parada/estación radio with searchable dropdown).

**Close Workflow**: Button to close disruption (sets estado=CERRADA, fecha_fin=now(), prevents location edit).

