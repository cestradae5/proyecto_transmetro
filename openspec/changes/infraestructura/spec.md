# Infrastructure Module Specification

## 1. Parada (Transit Stop) CRUD

### Requirements

**Create Transit Stop**: MUST accept POST `/api/infrastructure/paradas` with name, latitude (±90), longitude (±180), estado. MUST enforce name uniqueness and geographic bounds. Returns 201 with ParadaResponseDto or 400/401/403.

**Retrieve Parada**: MUST expose GET `/api/infrastructure/paradas[?page,limit,estado]` and `/paradas/{id}`. Returns 200 with single or paginated list; 404 if not found.

**Update Parada**: MUST accept PATCH `/api/infrastructure/paradas/{id}` to update fields. MUST prevent name conflicts and validate coordinates. Returns 200 or 400/404/409.

**Delete Parada**: MUST soft-delete (estado→INACTIVA) or hard-delete with `?force=true` flag. MUST reject if referenced by active línea (409). Returns 204.

### Scenarios

- **Create valid**: POST with `{nombre, latitud, longitud, estado}` → 201 with id, created_at
- **Duplicate name**: POST same nombre → 400 PARADA_NAME_DUPLICATE
- **Invalid coords**: latitud=91 → 400 INVALID_COORDINATES
- **Unauthenticated**: No Auth → 401; No INFRAESTRUCTURA_GESTIONAR → 403
- **List with filter**: GET `?estado=ACTIVA` → 200 with filtered paradas
- **Not found**: GET /999 → 404 PARADA_NOT_FOUND
- **Update partial**: PATCH `{nombre}` → 200, coords unchanged
- **Reject delete if in use**: DELETE when parada in línea → 409 PARADA_IN_USE

### Validation

| Field | Rule |
|-------|------|
| nombre | 1–100 chars, unique, required |
| latitud | ≥-90, ≤90 |
| longitud | ≥-180, ≤180 |
| estado | IN (ACTIVA, CERRADA, MANTENIMIENTO) |

---

## 2. Estación (Transit Station) CRUD

### Requirements

**Create Station**: MUST accept POST `/api/infrastructure/estaciones` with name, coordinates, estado_estacion, optional id_parada. MUST validate FK to parada if provided. Returns 201 or 400/401/403.

**Retrieve Estación**: MUST expose GET `/api/infrastructure/estaciones[?page,limit,estado]` and `/{id}`. Include related parada, assigned líneas (via tbl_estacion_linea). Returns 200 or 404.

**Update Estación**: MUST accept PATCH to change name, coordinates, estado, parada FK. MUST validate FK uniqueness (only one parada per estación). Returns 200 or 400/404.

**Delete Estación**: MUST reject if referenced by parqueo or tbl_estacion_linea (409). Soft-delete recommended. Returns 204 or 409.

### Scenarios

- **Create valid**: POST `{nombre, latitud, longitud, estado_estacion, id_parada?}` → 201
- **Invalid parada FK**: POST with non-existent id_parada → 400 PARADA_NOT_FOUND
- **Duplicate parada**: POST id_parada already assigned → 400 ESTACION_PARADA_DUPLICATE
- **Update parada FK**: PATCH `{id_parada}` → 200, validate uniqueness
- **List with pagination**: GET `?page=2&limit=10` → 200 with 10 estaciones
- **Detail with relationships**: GET /5 → include related parada, líneas (via junction)
- **Reject delete if parqueo refs**: DELETE when parqueo.id_estacion=this → 409 ESTACION_IN_USE

### Validation

| Field | Rule |
|-------|------|
| nombre | 1–120 chars, required |
| latitud/longitud | ±90/180 |
| estado_estacion | Required |
| id_parada | FK optional, max 1 per estación |

---

## 3. Parqueo (Parking Lot) CRUD

### Requirements

**Create Parking**: MUST accept POST `/api/infrastructure/parqueos` with name, tipo (VARCHAR 50), dirección, coords, capacidad_unidades (≥0), estado, id_estacion. MUST validate FK to estación. Returns 201 or 400/401/403.

**Retrieve Parqueo**: MUST expose GET `/api/infrastructure/parqueos[?page,limit,tipo,estado]` and `/{id}`. Include related estación, assigned líneas (via tbl_linea). Returns 200 or 404.

**Update Parqueo**: MUST accept PATCH to modify all fields. MUST validate capacidad_unidades ≥0 and estación FK. Returns 200 or 400/404.

**Delete Parqueo**: MUST reject if referenced by línea (409). Returns 204 or 409.

### Scenarios

- **Create valid**: POST `{nombre, tipo, dirección, latitud, longitud, capacidad_unidades≥0, estado, id_estacion}` → 201
- **Invalid estación FK**: id_estacion=999 → 400 ESTACION_NOT_FOUND
- **Negative capacity**: capacidad_unidades=-1 → 400 INVALID_CAPACITY
- **List by tipo**: GET `?tipo=SUPERFICIE` → 200 filtered
- **Detail**: GET /3 → include estación, líneas using this parqueo
- **Update capacity**: PATCH `{capacidad_unidades: 50}` → 200
- **Reject delete if línea refs**: DELETE when tbl_linea.id_parqueo=this → 409 PARQUEO_IN_USE

### Validation

| Field | Rule |
|-------|------|
| nombre | 1–120 chars |
| tipo | VARCHAR 50 |
| capacidad_unidades | ≥0 |
| id_estacion | FK, required |

---

## 4. Línea (Transit Line) CRUD

### Requirements

**Create Line**: MUST accept POST `/api/infrastructure/lineas` with numero_linea (unique), nombre, color_hex (#RRGGBB), estado, tipo_recorrido (CIRCULAR|LINEAL), id_parqueo (FK). MUST validate FK and hex color. Returns 201 or 400/401/403.

**Retrieve Línea**: MUST expose GET `/api/infrastructure/lineas[?page,limit,estado,tipo]` and `/{id}`. Include paradas (via tbl_linea_parada with orden, minutos_hasta_siguiente) and assigned estaciones (via tbl_estacion_linea with tipo_punto). Returns 200 or 404.

**Update Línea**: MUST accept PATCH to modify fields. MUST maintain ≥2 paradas constraint. MUST preserve parada sequence. Returns 200 or 400/404/409.

**Delete Línea**: MUST reject if referenced by tbl_asignacion_unidad (409). Returns 204 or 409.

**Manage Paradas**: MUST accept POST `/api/infrastructure/lineas/{id}/paradas` with parada_id, orden, minutos. MUST enforce unique orden per línea. PATCH to update order/time. DELETE to remove parada (ensure ≥2 remain).

### Scenarios

- **Create valid**: POST `{numero_linea, nombre, color_hex, estado, tipo_recorrido, id_parqueo}` → 201
- **Duplicate numero**: numero_linea="1" exists → 400 NUMERO_LINEA_DUPLICATE
- **Invalid color**: color_hex="ZZZ" → 400 INVALID_COLOR_HEX
- **Invalid parqueo**: id_parqueo=999 → 400 PARQUEO_NOT_FOUND
- **Add parada**: POST /1/paradas `{id_parada, orden:1, minutos:5}` → 201
- **Duplicate orden**: POST same orden in same línea → 409 ORDEN_DUPLICATE
- **List with paradas**: GET /1 → include paradas sorted by orden
- **Remove parada**: DELETE /1/paradas/{linea_parada_id} with <2 remaining → 409 LINEA_MIN_PARADAS

### Validation

| Field | Rule |
|-------|------|
| numero_linea | VARCHAR 20, unique |
| color_hex | Format #RRGGBB |
| tipo_recorrido | IN (CIRCULAR, LINEAL) |
| estado_linea | IN (ACTIVA, INACTIVA) |
| id_parqueo | FK required |
| paradas | ≥2 paradas required per línea |
| orden | >0, unique per línea |
| minutos_hasta_siguiente | ≥0 |

---

## 5. Afectación (Operational Disruption) CRUD

### Requirements

**Create Disruption**: MUST accept POST `/api/infrastructure/afectaciones` with tipo, motivo, fecha_inicio, fecha_fin (optional), estado, id_parada XOR id_estacion. MUST enforce XOR constraint (exactly one location). Returns 201 or 400/401/403.

**Retrieve Afectación**: MUST expose GET `/api/infrastructure/afectaciones[?page,limit,estado,tipo]` and `/{id}`. Include related parada or estación. Returns 200 or 404.

**Update Afectación**: MUST accept PATCH to modify motivo, fecha_fin, estado. MUST prevent changing location (parada/estación). MUST validate fecha_fin ≥ fecha_inicio. Returns 200 or 400/404.

**Close Disruption**: MUST accept PATCH estado→CERRADA and set fecha_fin. Returns 200 or 400.

### Scenarios

- **Create valid (parada)**: POST `{tipo, motivo, fecha_inicio, estado, id_parada}` (id_estacion=null) → 201
- **Create valid (estación)**: POST same fields with id_estacion, id_parada=null → 201
- **Both locations**: POST with both id_parada AND id_estacion → 400 XOR_VIOLATION
- **No location**: POST with both null → 400 XOR_VIOLATION
- **Invalid fecha**: fecha_fin < fecha_inicio → 400 INVALID_DATE_RANGE
- **Update motivo**: PATCH `{motivo: "nuevo"}` → 200
- **Close disruption**: PATCH `{estado: CERRADA, fecha_fin: now()}` → 200
- **List by estado**: GET `?estado=ABIERTA` → 200 filtered
- **Detail**: GET /7 → include parada or estación details

### Validation

| Field | Rule |
|-------|------|
| tipo | VARCHAR 50 |
| motivo | Required TEXT |
| fecha_inicio | Required, TIMESTAMPTZ |
| fecha_fin | Optional, ≥fecha_inicio if set |
| estado | VARCHAR 30 |
| id_parada/id_estacion | Exactly one NOT NULL (XOR) |

---

## Cross-Entity Constraints

- **Cascade/Restrict**: Parada deletion → check líneas; Estación deletion → check parqueos; Parqueo deletion → check líneas
- **Permission Gate**: All endpoints require `INFRAESTRUCTURA_GESTIONAR` permission
- **Soft Delete**: Use estado field for logical deletion where applicable
- **Pagination**: Default limit=10, max=100
- **Timestamps**: created_at, updated_at managed by backend

