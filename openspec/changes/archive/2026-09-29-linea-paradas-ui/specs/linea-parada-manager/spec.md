# Línea Parada Manager Specification

## Purpose

Provide a frontend modal dialog that enables transit line managers to view, add, reorder, and remove paradas in a línea sequence. The manager displays paradas ordered by `orden`, allows inline editing of `orden` and `minutosHastaSiguiente`, enforces minimum parada constraints (≥2 per línea), and handles backend error responses with user-friendly Spanish messages.

## Requirements

### Requirement: Display Parada Sequence Table

The system **MUST** fetch and display an ordered table of paradas assigned to a selected línea, sorted by `orden` ascending. Each row **SHALL** show parada name, orden, minutosHastaSiguiente, and estado. The table **MUST** display a loading state while fetching and an empty state when no paradas are assigned (only on new líneas).

#### Scenario: Display parada table on modal open

- GIVEN a user clicks "Gestionar paradas" button in LineasTable for línea id=1
- WHEN the modal opens and `GET /infrastructure/lineas/1/paradas` is fetched
- THEN the modal displays an ordered table with columns: parada name, orden, minutosHastaSiguiente, parada estado (ACTIVA|CERRADA|MANTENIMIENTO)
- AND rows are sorted by orden ascending
- AND each row has "Editar" and "Eliminar" action buttons

#### Scenario: Display loading state during fetch

- GIVEN the modal opens
- WHEN the fetch is in progress
- THEN a loading spinner or skeleton is shown
- AND action buttons are disabled until data arrives

#### Scenario: Display empty state

- GIVEN a new línea has no paradas assigned
- WHEN the modal opens
- THEN a message "No hay paradas asignadas" is displayed
- AND the add form is visible below

### Requirement: Add Parada to Línea

The system **MUST** provide a form with a dropdown to select an available parada and inputs for `orden` and `minutosHastaSiguiente`. The dropdown **SHALL** exclude paradas already assigned to the línea and show parada name + número as display text. The system **MUST** validate that orden is positive and minutosHastaSiguiente ≥0, then POST to `/infrastructure/lineas/{id}/paradas`. On success, refresh the table. On error, map backend error codes to Spanish messages.

#### Scenario: Add parada with valid inputs

- GIVEN the modal displays the add form with available paradas in dropdown
- AND 5 paradas exist in the system, 3 already in línea id=1
- WHEN user selects an unassigned parada (id=5), enters orden=4, minutosHastaSiguiente=10
- AND clicks "Agregar parada"
- THEN POST `/infrastructure/lineas/1/paradas` with `{idParada: "5", orden: 4, minutosHastaSiguiente: 10}`
- AND on 201 response, the table refreshes and shows the new parada row

#### Scenario: Reject duplicate orden

- GIVEN línea id=1 has paradas at orden 1, 2, 3
- WHEN user tries to add a new parada with orden=2
- AND clicks "Agregar parada"
- THEN POST returns 409 with error code `ORDEN_DUPLICATE`
- AND the modal displays Spanish message "Ya existe una parada con este orden en la línea"
- AND the form remains open for retry

#### Scenario: Reject parada already assigned

- GIVEN parada id=5 is already in línea id=1
- WHEN the dropdown is rendered
- THEN parada id=5 is NOT in the dropdown options
- AND if user somehow submits it via back-button or curl, POST returns 409 with `PARADA_ALREADY_IN_LINEA`
- AND the modal displays "Esta parada ya está asignada a la línea"

#### Scenario: Validate orden field

- GIVEN the add form
- WHEN user enters orden=0 or orden=-1
- AND clicks "Agregar parada"
- THEN client-side validation prevents submission
- AND error message "El orden debe ser mayor a 0" is displayed

#### Scenario: Validate minutosHastaSiguiente field

- GIVEN the add form
- WHEN user enters minutosHastaSiguiente=-5
- AND clicks "Agregar parada"
- THEN client-side validation prevents submission
- AND error message "Los minutos no pueden ser negativos" is displayed

### Requirement: Edit Parada Orden and Travel Time Inline

The system **MUST** allow users to click "Editar" on a parada row, shifting the row into edit mode with input fields for `orden` and `minutosHastaSiguiente` and "Guardar" / "Cancelar" buttons. On save, PATCH the updated values. On error, display backend error message. On cancel, revert row to read-only.

#### Scenario: Edit orden and minutos successfully

- GIVEN a parada row in the table shows orden=2, minutosHastaSiguiente=5
- WHEN user clicks "Editar" on that row
- THEN the row switches to edit mode with two input fields pre-filled with 2 and 5
- AND user changes orden to 3, minutosHastaSiguiente to 8
- AND clicks "Guardar"
- THEN PATCH `/infrastructure/lineas/1/paradas/{lineaParadaId}` with `{orden: 3, minutosHastaSiguiente: 8}`
- AND on 200 response, the table refreshes and the row exits edit mode
- AND the values are updated

#### Scenario: Cancel edit without saving

- GIVEN a parada row is in edit mode with pending changes
- WHEN user clicks "Cancelar"
- THEN the row reverts to read-only mode
- AND the original values (orden=2, minutosHastaSiguiente=5) are restored
- AND no PATCH request is sent

#### Scenario: Reject duplicate orden on edit

- GIVEN línea id=1 has paradas at orden 1, 2, 3
- WHEN user edits parada at orden=1 and changes it to orden=2
- AND clicks "Guardar"
- THEN PATCH returns 409 with `ORDEN_DUPLICATE`
- AND the modal displays "Ya existe una parada con este orden en la línea"
- AND the row remains in edit mode for retry

#### Scenario: Validation on edit

- GIVEN a parada row is in edit mode
- WHEN user clears the orden field or enters orden=0
- AND clicks "Guardar"
- THEN client-side validation prevents submission
- AND error "El orden debe ser mayor a 0" is displayed

### Requirement: Remove Parada with Minimum Enforcement

The system **MUST** allow removal of a parada via "Eliminar" button, BUT **SHALL** disable the button when exactly 2 paradas remain (línea minimum). The system **SHALL** DELETE `/infrastructure/lineas/{id}/paradas/{lineaParadaId}`. On success, refresh table. If user somehow triggers delete when 2 remain, backend returns 409 with `LINEA_MIN_PARADAS`; frontend displays Spanish message and does NOT remove the row.

#### Scenario: Remove parada when >2 exist

- GIVEN línea id=1 has 4 paradas
- WHEN user clicks "Eliminar" on any parada row
- THEN the button is enabled (not disabled)
- AND DELETE `/infrastructure/lineas/1/paradas/{lineaParadaId}` is sent
- AND on 204 response, the table refreshes and the row is removed

#### Scenario: Disable delete button when exactly 2 paradas remain

- GIVEN línea id=1 has exactly 2 paradas
- WHEN the modal displays the table
- THEN all "Eliminar" buttons are disabled (grayed out)
- AND a tooltip or aria-label explains "Una línea debe tener al menos 2 paradas"

#### Scenario: Show confirmation before delete (optional UX refinement)

- GIVEN user clicks a non-disabled "Eliminar" button (>2 paradas exist)
- WHEN a confirmation modal appears asking "¿Eliminar esta parada?"
- AND user clicks "Eliminar" in the confirmation
- THEN DELETE is sent; on 204, table refreshes

#### Scenario: Handle backend minimum enforcement

- GIVEN línea id=1 has exactly 2 paradas but frontend delete button was mistakenly not disabled
- WHEN DELETE is triggered by user or race condition
- AND backend returns 409 with `LINEA_MIN_PARADAS`
- THEN the frontend displays "Una línea debe tener al menos 2 paradas"
- AND the table does NOT remove the row (revert state)

### Requirement: Error Handling and User Messages

The system **MUST** map backend error codes to Spanish user-visible messages and display them in a clear error message element (alert, toast, or modal). Error messages **MUST** be dismissed by user action and **SHALL NOT** auto-dismiss.

#### Scenario: Display error for not found (any 404)

- GIVEN any operation returns HTTP 404 (the backend does not guarantee a machine-readable code for 404s)
- WHEN the modal catches the error
- THEN the modal displays "El recurso solicitado no existe o fue eliminado"
- AND the form (if open) remains open and a close button is available

#### Scenario: Display generic network error

- GIVEN a network error (timeout, 500, etc.) on any operation
- WHEN the modal catches the error
- THEN a message "Error de conexión. Por favor, intente de nuevo." is displayed
- AND the user can retry or close the modal

### Requirement: Modal Dialog Container and Lifecycle

The system **MUST** render the parada manager as a fixed modal dialog overlay that opens when "Gestionar paradas" button is clicked in LineasTable. The modal **SHALL** have a title, close button (X), and "Cerrar" button at the bottom. The modal **MUST** close on close button click or when the user clicks outside the modal (escape key or backdrop click). On close, any unsaved changes are discarded.

#### Scenario: Open and close parada manager modal

- GIVEN LineasTable displays a row for línea id=1
- WHEN user clicks "Gestionar paradas" button
- THEN a fixed modal overlay appears with title "Gestionar paradas: {línea nombre}"
- AND the modal displays the parada table, add form, and close button
- AND the page behind the modal is darkened (backdrop)

#### Scenario: Close modal on close button click

- GIVEN the modal is open
- WHEN user clicks the X close button or "Cerrar" button
- THEN the modal closes
- AND the table state behind is refreshed (in case changes were made)

#### Scenario: Close modal on escape key

- GIVEN the modal is open and focused
- WHEN user presses Escape key
- THEN the modal closes

#### Scenario: Close modal on backdrop click

- GIVEN the modal is open
- WHEN user clicks on the darkened area outside the modal
- THEN the modal closes

### Requirement: Data Refresh and Consistency

The system **MUST** refetch parada table data immediately after successful add, edit, or remove operations. The system **SHOULD** maintain frontend state consistency with backend by re-querying the full parada list after each mutation, ensuring sort order and relationships are correct.

#### Scenario: Refresh table after successful add

- GIVEN a parada is added successfully (201 response)
- WHEN the response returns
- THEN the hook automatically calls GET `/infrastructure/lineas/1/paradas` again
- AND the table re-renders with the new parada in correct orden position

#### Scenario: Refresh table after successful edit

- GIVEN a parada orden is updated successfully (200 response)
- WHEN the response returns
- THEN the hook refetches the full parada list
- AND the table re-renders with rows re-sorted by orden

#### Scenario: Refresh table after successful remove

- GIVEN a parada is removed successfully (204 response)
- WHEN the response returns
- THEN the hook refetches the full parada list
- AND the table re-renders without the deleted parada

## Validation Rules

| Field | Rule |
|-------|------|
| orden | >0, unique per línea, integer |
| minutosHastaSiguiente | ≥0, integer |
| idParada (add form) | FK required, must exist, must not already be in línea |
| paradas per línea | minimum ≥2 (enforced on delete) |

## Error Code Mapping

| Backend Code | Spanish Message |
|--------------|-----------------|
| `PARADA_ALREADY_IN_LINEA` | "Esta parada ya está asignada a la línea" |
| `ORDEN_DUPLICATE` | "Ya existe una parada con este orden en la línea" |
| `LINEA_MIN_PARADAS` | "Una línea debe tener al menos 2 paradas" |
| Any HTTP 404 (no code) | "El recurso solicitado no existe o fue eliminado" |
| Generic 5xx | "Error de conexión. Por favor, intente de nuevo." |

## Known Limitations

**Orden Reordering Constraint**: The backend enforces UNIQUE(idLinea, orden), which means reordering two paradas (e.g., swapping orden 1 ↔ 2) requires a temporary free orden value during the transition. The frontend **SHOULD** document this behavior in a help tooltip: "Para reordenar, edita el orden de cada parada. Si el nuevo orden ya existe, asigna un número temporal diferente a otro parada primero, luego actualiza ambas." Alternatively, backend may provide an atomic reorder endpoint in a follow-up.

## API Contract

| Endpoint | Method | Request Body | Response | Status |
|----------|--------|--------------|----------|--------|
| `/infrastructure/lineas/{id}/paradas` | GET | — | `{ idLineaParada, orden, minutosHastaSiguiente, idParada, idLinea, parada: {...} }[]` | 200, 404, 401 |
| `/infrastructure/lineas/{id}/paradas` | POST | `{ idParada, orden, minutosHastaSiguiente }` | — | 201, 400, 409, 401 |
| `/infrastructure/lineas/{id}/paradas/{lineaParadaId}` | PATCH | `{ orden?, minutosHastaSiguiente? }` | — | 200, 400, 409, 404, 401 |
| `/infrastructure/lineas/{id}/paradas/{lineaParadaId}` | DELETE | — | — | 204, 409, 404, 401 |

## Frontend Components

- **LineaParadaDialog**: Modal container, manages fetch state and error state
- **LineaParadaTable**: Ordered list of paradas with edit/delete buttons, inline edit mode
- **LineaParadaForm**: Form for editing orden + minutosHastaSiguiente with Save/Cancel
- **LineaParadaAddForm**: Form with dropdown, orden input, minutos input; Agregar button
- **useLineaParadas**: Custom hook encapsulating fetch, add, update, remove + error handling
