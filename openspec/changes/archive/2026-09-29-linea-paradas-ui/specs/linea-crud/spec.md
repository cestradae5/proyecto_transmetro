# Delta for Línea (Transit Line) — Gestionar Paradas Entry Point

## ADDED Requirements

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

## MODIFIED Requirements

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
