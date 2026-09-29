# Línea (Transit Line) Specification

## Purpose

Líneas represent transit routes that connect multiple paradas in a sequence, with assigned estaciones (via tbl_estacion_linea), and belong to a parqueo for vehicle deployment. Each línea requires at least 2 paradas ordered with travel time between consecutive stops.

## Requirements

### Requirement: Create Transit Line

The system **MUST** accept POST `/api/infrastructure/lineas` with numero_linea (VARCHAR 20, unique), nombre, color_hex (format #RRGGBB), estado_linea (ACTIVA|INACTIVA), tipo_recorrido (CIRCULAR|LINEAL), and id_parqueo (FK required). The system **SHALL** validate color format, parqueo FK, and número uniqueness. Returns 201 with LineaResponseDto or 400/401/403.

#### Scenario: Create valid línea

- GIVEN parqueo id=1 exists; user has `INFRAESTRUCTURA_GESTIONAR`
- WHEN POST `/api/infrastructure/lineas` with `{numero_linea: "1", nombre: "Línea Centro", color_hex: "#FF5733", estado_linea: "ACTIVA", tipo_recorrido: "CIRCULAR", id_parqueo: 1}`
- THEN status 201 with complete línea record (id, created_at, updated_at)

#### Scenario: Reject duplicate numero_linea

- GIVEN línea with numero_linea="1" exists
- WHEN POST with `numero_linea: "1", ...`
- THEN status 400 with error `NUMERO_LINEA_DUPLICATE`

#### Scenario: Reject invalid color hex

- GIVEN POST with `color_hex: "ZZZ"` or `color_hex: "FF573"`
- WHEN POST `/api/infrastructure/lineas`
- THEN status 400 with error `INVALID_COLOR_HEX`

#### Scenario: Reject invalid parqueo FK

- GIVEN POST with `id_parqueo: 999`
- WHEN POST `/api/infrastructure/lineas`
- THEN status 400 with error `PARQUEO_NOT_FOUND`

### Requirement: Retrieve Transit Lines

The system **MUST** expose GET `/api/infrastructure/lineas` (list, paginated, filterable by estado, tipo_recorrido, numero_linea keyword) and `/{id}` (detail). Detail **SHALL** include paradas in order (via tbl_linea_parada with orden, minutos_hasta_siguiente) and assigned estaciones (via tbl_estacion_linea with tipo_punto). Returns 200 or 404.

**Addition**: LineasTable display now includes an additional action button "Gestionar paradas" alongside existing "Editar" and "Eliminar" buttons.

(Previously: LineasTable had only "Editar" and "Eliminar" actions; "Gestionar paradas" provides modal entry point to the new LineaParadaDialog feature.)

#### Scenario: Get single línea with full relationships

- GIVEN línea id=1
- WHEN GET `/api/infrastructure/lineas/1`
- THEN status 200 with línea + paradas array (sorted by orden, include minutos) + estaciones array (include tipo_punto)

#### Scenario: List líneas by tipo_recorrido

- GIVEN líneas with CIRCULAR and LINEAL tipos
- WHEN GET `/api/infrastructure/lineas?tipo_recorrido=LINEAL`
- THEN status 200 with only LINEAL líneas

#### Scenario: List with pagination

- GIVEN 50 líneas
- WHEN GET `/api/infrastructure/lineas?page=1&limit=20`
- THEN status 200 with 20 records and metadata

#### Scenario: Display LineasTable with Gestionar paradas button

- GIVEN LineasTable renders
- WHEN líneas are fetched successfully
- THEN each row displays nombre, tipo_recorrido, estado, and a three-button actions column: "Editar", "Eliminar", "Gestionar paradas"
- AND "Gestionar paradas" opens the LineaParadaDialog for that línea
### Requirement: Update Transit Line

The system **MUST** accept PATCH to update nombre, color_hex, estado, tipo_recorrido, and id_parqueo. Update **SHALL** validate color format and parqueo FK. Update **MUST NOT** allow removing paradas if only 2 remain. Returns 200 or 400/404/409.

#### Scenario: Update nombre

- GIVEN línea id=1 with nombre="Línea Centro"
- WHEN PATCH with `{nombre: "Línea Centro Rápida"}`
- THEN status 200, nombre updated

#### Scenario: Update color hex

- GIVEN PATCH with `color_hex: "#00FF00"`
- WHEN PATCH `/api/infrastructure/lineas/1`
- THEN status 200, color updated

#### Scenario: Reject invalid color on update

- GIVEN PATCH with `color_hex: "NOT_HEX"`
- WHEN PATCH `/api/infrastructure/lineas/1`
- THEN status 400 with error `INVALID_COLOR_HEX`

### Requirement: Manage Parada Sequence

The system **MUST** expose POST `/api/infrastructure/lineas/{id}/paradas` to add a parada with orden (>0, unique per línea) and minutos_hasta_siguiente (≥0). PATCH to update orden/minutos. DELETE to remove (reject if <2 remain). All operations **MUST** validate parada FK and enforce ≥2 paradas per línea.

#### Scenario: Add parada to línea

- GIVEN línea id=1, parada id=5
- WHEN POST `/api/infrastructure/lineas/1/paradas` with `{id_parada: 5, orden: 1, minutos_hasta_siguiente: 5}`
- THEN status 201 with tbl_linea_parada record created

#### Scenario: Reject duplicate orden

- GIVEN línea id=1 with parada at orden=1
- WHEN POST with `{id_parada: 6, orden: 1, ...}`
- THEN status 409 with error `ORDEN_DUPLICATE`

#### Scenario: Reject invalid parada FK

- GIVEN POST with `id_parada: 999`
- WHEN POST `/api/infrastructure/lineas/1/paradas`
- THEN status 400 with error `PARADA_NOT_FOUND`

#### Scenario: Update parada order/time

- GIVEN línea_parada record (línea id=1, parada id=5, orden=1)
- WHEN PATCH `/api/infrastructure/lineas/1/paradas/{linea_parada_id}` with `{orden: 2, minutos_hasta_siguiente: 7}`
- THEN status 200, orden and minutos updated (validate uniqueness)

#### Scenario: Remove parada (with >2 remaining)

- GIVEN línea id=1 with 3 paradas
- WHEN DELETE `/api/infrastructure/lineas/1/paradas/{linea_parada_id}`
- THEN status 204, record deleted

#### Scenario: Reject remove parada (<2 remaining)

- GIVEN línea id=1 with 2 paradas (minimum)
- WHEN DELETE `/api/infrastructure/lineas/1/paradas/{linea_parada_id}`
- THEN status 409 with error `LINEA_MIN_PARADAS`

### Requirement: Delete Transit Line

The system **MUST** reject deletion if línea is referenced by tbl_asignacion_unidad (409). Soft delete (estado→INACTIVA) recommended. Returns 204 or 409.

#### Scenario: Reject delete if unit assignment exists

- GIVEN línea id=1, tbl_asignacion_unidad with id_linea=1
- WHEN DELETE `/api/infrastructure/lineas/1`
- THEN status 409 with error `LINEA_IN_USE`

### Requirement: Gestionar Paradas Entry Point

The system **MUST** add a "Gestionar paradas" action button in the LineasTable actions column (alongside "Editar" and "Eliminar" buttons). Clicking this button **SHALL** open the LineaParadaDialog modal, which provides access to the full parada manager UI (view, add, edit, remove paradas for the selected línea). The button **MUST** be enabled for all líneas regardless of estado_linea (ACTIVA or INACTIVA).

#### Scenario: Display Gestionar paradas button in LineasTable

- GIVEN LineasTable displays rows for multiple líneas
- WHEN the table renders
- THEN each row in the actions column shows three buttons: "Editar", "Eliminar", and "Gestionar paradas"
- AND "Gestionar paradas" is enabled for every row

#### Scenario: Open parada manager on button click

- GIVEN a user views LineasTable for línea id=1 with nombre="Línea Centro"
- WHEN user clicks "Gestionar paradas" button in that row
- THEN the LineaParadaDialog modal opens with title "Gestionar paradas: Línea Centro"
- AND the modal shows the parada table and add form for línea id=1

#### Scenario: Manage paradas of an INACTIVA línea

- GIVEN a línea with estado_linea=INACTIVA
- WHEN user clicks "Gestionar paradas" in that row
- THEN the LineaParadaDialog opens and all parada operations are available

#### Scenario: Close modal and return to LineasTable

- GIVEN the parada manager modal is open
- WHEN user clicks close button or "Cerrar" button in the modal
- THEN the modal closes
- AND LineasTable is displayed again with the latest línea data (if any mutations occurred during modal session, table may be refreshed)

## Validation Rules

| Field | Rule |
|-------|------|
| numero_linea | VARCHAR 20, unique, required |
| nombre | 1–120 chars |
| color_hex | Format #RRGGBB (regex: ^#[0-9A-F]{6}$) |
| estado_linea | IN (ACTIVA, INACTIVA) |
| tipo_recorrido | IN (CIRCULAR, LINEAL) |
| id_parqueo | FK required |
| orden | >0, unique per línea |
| minutos_hasta_siguiente | ≥0 |
| paradas min | ≥2 per línea |

## API Contract

| Endpoint | Method | Response | Status |
|----------|--------|----------|--------|
| `/api/infrastructure/lineas` | POST | LineaResponseDto | 201, 400, 401, 403 |
| `/api/infrastructure/lineas` | GET | LineaResponseDto[] | 200, 401 |
| `/api/infrastructure/lineas/{id}` | GET | LineaResponseDto | 200, 404, 401 |
| `/api/infrastructure/lineas/{id}` | PATCH | LineaResponseDto | 200, 400, 404, 401 |
| `/api/infrastructure/lineas/{id}` | DELETE | — | 204, 409, 401 |
| `/api/infrastructure/lineas/{id}/paradas` | POST | — | 201, 400, 409, 401 |
| `/api/infrastructure/lineas/{id}/paradas/{linea_parada_id}` | PATCH | — | 200, 400, 409, 401 |
| `/api/infrastructure/lineas/{id}/paradas/{linea_parada_id}` | DELETE | — | 204, 409, 401 |

## Frontend Integration

**List Page**: Table with numero_linea, nombre, color badge, tipo_recorrido, parada count, estación count, estado, actions.

**Detail Page**: Full línea details (color swatch, type, parqueo link), paradas ordered table (drag-reorder UX, orden, minutos, parada link), estaciones table, add/remove parada buttons.

**Form Component**: Inputs for numero_linea, nombre, color_hex (color picker), tipo_recorrido radio buttons, estado dropdown, parqueo lookup.

**Parada Manager**: Inline form or modal for adding/editing parada order and travel time; drag-drop reordering optional (MVP: inline ordering only).

