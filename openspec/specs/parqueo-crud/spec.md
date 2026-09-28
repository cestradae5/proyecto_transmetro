# Parqueo (Parking Lot) Specification

## Purpose

Parqueos represent parking/storage facilities for transit vehicles. Each parqueo belongs to exactly one estación (via id_estacion FK), has a capacity (≥0), type classification, and serves as a deployment point for one or more líneas.

## Requirements

### Requirement: Create Parking Lot

The system **MUST** accept POST `/api/infrastructure/parqueos` with nombre, tipo (VARCHAR 50), dirección (TEXT), latitud, longitud, capacidad_unidades (≥0), estado_parqueo, and id_estacion (FK required). The system **SHALL** validate FK to estación, enforce capacity ≥0. Returns 201 with ParqueoResponseDto or 400/401/403.

#### Scenario: Create valid parqueo

- GIVEN estación id=2 exists; user has `INFRAESTRUCTURA_GESTIONAR`
- WHEN POST `/api/infrastructure/parqueos` with `{nombre: "Parqueo Centro", tipo: "SUPERFICIE", dirección: "Calle 5 #123", latitud: 10.5, longitud: -75.4, capacidad_unidades: 50, estado_parqueo: "OPERATIVO", id_estacion: 2}`
- THEN status 201 with complete parqueo record

#### Scenario: Reject invalid estación FK

- GIVEN POST with `id_estacion: 999` (non-existent)
- WHEN POST `/api/infrastructure/parqueos`
- THEN status 400 with error `ESTACION_NOT_FOUND`

#### Scenario: Reject negative capacity

- GIVEN POST with `capacidad_unidades: -5`
- WHEN POST `/api/infrastructure/parqueos`
- THEN status 400 with error `INVALID_CAPACITY`

#### Scenario: Reject unauthenticated

- GIVEN no `INFRAESTRUCTURA_GESTIONAR`
- WHEN POST `/api/infrastructure/parqueos`
- THEN status 403

### Requirement: Retrieve Parking Lots

The system **MUST** expose GET `/api/infrastructure/parqueos` (list, paginated, filterable by tipo, estado, estacion) and `/{id}` (detail). Detail **SHALL** include related estación and array of líneas using this parqueo (via tbl_linea.id_parqueo). Returns 200 or 404.

#### Scenario: Get single parqueo with relationships

- GIVEN parqueo id=3
- WHEN GET `/api/infrastructure/parqueos/3`
- THEN status 200 with parqueo + estación object + líneas array

#### Scenario: List parqueos filtered by tipo

- GIVEN parqueos with tipos SUPERFICIE, SUBTERRANEO, ESTRUCTURA
- WHEN GET `/api/infrastructure/parqueos?tipo=SUBTERRANEO`
- THEN status 200 with only SUBTERRANEO records

#### Scenario: List parqueos by estación

- GIVEN estación id=2 with 3 parqueos
- WHEN GET `/api/infrastructure/parqueos?id_estacion=2`
- THEN status 200 with 3 parqueos

#### Scenario: List with pagination

- GIVEN 20 parqueos
- WHEN GET `/api/infrastructure/parqueos?page=1&limit=10`
- THEN status 200 with 10 records and metadata

### Requirement: Update Parking Lot

The system **MUST** accept PATCH to update nombre, dirección, capacidad_unidades, estado, and id_estacion. Update **SHALL** validate capacity ≥0 and estación FK. Returns 200 or 400/404.

#### Scenario: Update capacity

- GIVEN parqueo id=3 with capacidad_unidades=50
- WHEN PATCH with `{capacidad_unidades: 75}`
- THEN status 200, capacity updated

#### Scenario: Update estación FK

- GIVEN parqueo id=3 with id_estacion=2
- WHEN PATCH with `{id_estacion: 5}`
- THEN status 200, estación changed (validate FK)

#### Scenario: Reject invalid estación

- GIVEN PATCH with `id_estacion: 999`
- WHEN PATCH `/api/infrastructure/parqueos/3`
- THEN status 400 with error `ESTACION_NOT_FOUND`

#### Scenario: Reject negative capacity

- GIVEN PATCH with `capacidad_unidades: -1`
- WHEN PATCH `/api/infrastructure/parqueos/3`
- THEN status 400 with error `INVALID_CAPACITY`

### Requirement: Delete Parking Lot

The system **MUST** reject deletion if parqueo is referenced by any línea (409). Soft delete (estado→INACTIVO) recommended. Returns 204 or 409.

#### Scenario: Reject delete if línea references

- GIVEN parqueo id=3, línea id=1 with id_parqueo=3
- WHEN DELETE `/api/infrastructure/parqueos/3`
- THEN status 409 with error `PARQUEO_IN_USE`

#### Scenario: Allow delete if no references

- GIVEN parqueo id=3 with no línea references
- WHEN DELETE `/api/infrastructure/parqueos/3`
- THEN status 204, parqueo deleted or estado→INACTIVO

## Validation Rules

| Field | Rule |
|-------|------|
| nombre | 1–120 chars, required |
| tipo | VARCHAR 50 (e.g., SUPERFICIE, SUBTERRANEO, ESTRUCTURA) |
| dirección | TEXT, required |
| latitud/longitud | ±90/180 |
| capacidad_unidades | ≥0 (CHECK constraint) |
| estado_parqueo | VARCHAR 30, required |
| id_estacion | FK required, must exist |

## API Contract

| Endpoint | Method | Response | Status |
|----------|--------|----------|--------|
| `/api/infrastructure/parqueos` | POST | ParqueoResponseDto | 201, 400, 401, 403 |
| `/api/infrastructure/parqueos` | GET | ParqueoResponseDto[] | 200, 401 |
| `/api/infrastructure/parqueos/{id}` | GET | ParqueoResponseDto | 200, 404, 401 |
| `/api/infrastructure/parqueos/{id}` | PATCH | ParqueoResponseDto | 200, 400, 404, 401 |
| `/api/infrastructure/parqueos/{id}` | DELETE | — | 204, 409, 401 |

## Frontend Integration

**List Page**: Table with nombre, tipo, estación name (link), capacidad_unidades, estado, líneas count, actions.

**Detail Page**: Full parqueo details (address, capacity, tipo), estación link, líneas using this parqueo (table), edit/delete buttons.

**Form Component**: Inputs for nombre, tipo (dropdown), dirección (textarea), latitud/longitud, capacidad_unidades (number input), estado_parqueo dropdown, estación lookup (searchable dropdown).

