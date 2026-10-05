### E2E Tests: Personal (employee administration)

**Suite ID:** `PERSONAL-E2E`
**Feature:** `/personal` page — employee CRUD

---

## Preconditions

- The admin web production build exists (`npm run build -w @transmetro/admin-web`);
  `playwright.config.ts` serves it with `vite preview` on `127.0.0.1:4173`.
- A compatible Chromium browser is available to Playwright.
- No backend and no database are needed: the session is seeded through
  `localStorage` (`transmetro_token` / `transmetro_user`, the contract the
  `AuthProvider` reads) and every `/personal/*` call is fulfilled by
  `page.route()` from an in-memory roster. External assets (Tailwind CDN,
  Google Fonts) are aborted so the suite never touches the network.

## Mocked API surface

| Request | Mock behaviour |
| --- | --- |
| `GET /personal/empleados` | Applies the real `search` / `status` / `roleId` filters over the in-memory roster |
| `GET /personal/roles` | `200` with the two active roles |
| `POST /personal/empleados` | `201` and appends the row (so the hook's refetch shows it); `409` in `PERSONAL-E2E-004` |
| `PATCH /personal/empleados/:id` | `200`, merges the payload and re-resolves the role |
| `DELETE /personal/empleados/:id` | `204` and drops the row; `409` in `PERSONAL-E2E-006` |

`OPTIONS` preflights are answered with permissive CORS headers because the
production build calls `http://localhost:3000` (a different origin from the
preview server).

---

## Test Case: `PERSONAL-E2E-001` - Reach the page and list employees and roles

**Priority:** `critical`

**Tags:**
- type → `@e2e`
- feature → `@personal`

**Description/Objective:** Verify that a user with module `personnel` and
`EMPLEADOS_PERFILES_ADMINISTRAR` reaches `/personal` and renders the roster
from `GET /personal/empleados`, with the role filter populated from
`GET /personal/roles`.

**Preconditions:**
- A user seeded with `scope.modules: ["personnel"]` and the
  `EMPLEADOS_PERFILES_ADMINISTRAR` permission.

### Flow Steps:
1. Seed the session in `localStorage` and open `/personal`.
2. Locate the page heading and the two seeded rows.
3. Locate the role filter options.
4. Assert both list endpoints were called.

### Expected Result:
- The URL stays on `/personal` (no redirect).
- The heading reads `Personal (2)`.
- Both employees render, with the role name and a `DD/MM/YYYY` hire date.
- The role filter offers `Todos los roles`, `Administrador del Sistema`, `Piloto`.
- `GET /personal/empleados` and `GET /personal/roles` were both requested.

---

## Test Case: `PERSONAL-E2E-002` - Search is sent as a query param

**Priority:** `critical`

**Tags:**
- type → `@e2e`
- feature → `@personal`
- area → `@filters`

**Description/Objective:** Verify that typing in the search box sends
`?search=` to the API once the debounce elapses, and that the returned rows
are filtered.

**Preconditions:**
- The roster is loaded.

### Flow Steps:
1. Fill `Buscar empleados` with `ana`.
2. Wait for `GET /personal/empleados?search=ana`.
3. Inspect the rendered rows.

### Expected Result:
- The request URL carries `search=ana` (filtering is server-side, not client-side).
- Only the matching employee remains.

---

## Test Case: `PERSONAL-E2E-003` - Create an employee

**Priority:** `critical`

**Tags:**
- type → `@e2e`
- feature → `@personal`
- area → `@create`

**Description/Objective:** Verify the create dialog end to end: required
fields, a `201` from the API, and the hook's silent refetch surfacing the new
row.

### Flow Steps:
1. Click `Nuevo empleado`.
2. Fill `Nombre *`, `Correo *`, `Rol *` and `DPI *`.
3. Submit with `Guardar`.

### Expected Result:
- The dialog closes.
- The heading count goes from `Personal (2)` to `Personal (3)`.
- The new row renders with the role name resolved from `roleId`.
- `POST /personal/empleados` was requested.

---

## Test Case: `PERSONAL-E2E-004` - `409` on create keeps the dialog open

**Priority:** `high`

**Tags:**
- type → `@e2e`
- feature → `@personal`
- area → `@errors`

**Description/Objective:** Verify that a conflict (duplicate email or DPI) shows
the backend message verbatim and does not close the dialog or refresh the list.

### Flow Steps:
1. Open `Nuevo empleado` and fill the required fields.
2. Submit; the API answers `409` with a conflict message.
3. Inspect the dialog and the list.

### Expected Result:
- The dialog displays the backend `message` in its alert region.
- The dialog stays open.
- The roster is unchanged (no refetch, no new row).

---

## Test Case: `PERSONAL-E2E-005` - Delete through the confirm dialog

**Priority:** `critical`

**Tags:**
- type → `@e2e`
- feature → `@personal`
- area → `@delete`

**Description/Objective:** Verify the delete confirmation and that a `204`
removes the row.

### Flow Steps:
1. Click `Eliminar <nombre>` on a row.
2. Assert the `alertdialog` and that the deactivate shortcut is hidden.
3. Confirm with `Eliminar`.

### Expected Result:
- The confirmation names the employee.
- `Desactivar en su lugar` is absent before any failure.
- After confirming, the dialog closes, the row is gone and the count drops to
  `Personal (1)`.
- `DELETE /personal/empleados/:id` was requested.

---

## Test Case: `PERSONAL-E2E-006` - `409` on delete offers deactivation

**Priority:** `high`

**Tags:**
- type → `@e2e`
- feature → `@personal`
- area → `@delete`
- area → `@errors`

**Description/Objective:** Verify that a delete refused because the employee
has history shows the backend message and offers the `Desactivar en su lugar`
shortcut, which deactivates instead of deleting.

### Flow Steps:
1. Click `Eliminar <nombre>` and confirm; the API answers `409`.
2. Assert the message, the still-open dialog and the shortcut button.
3. Click `Desactivar en su lugar`.

### Expected Result:
- The backend message is displayed and the dialog stays open.
- The row is still present.
- After the shortcut, the dialog closes and the row shows `Inactivo`.
- Both `DELETE /personal/empleados/:id` and `PATCH /personal/empleados/:id`
  were requested.

---

## Test Case: `PERSONAL-E2E-007` - No mutation controls without the permission

**Priority:** `critical`

**Tags:**
- type → `@e2e`
- feature → `@personal`
- area → `@permissions`

**Description/Objective:** Verify that a user with module `personnel` but
without `EMPLEADOS_PERFILES_ADMINISTRAR` gets a read-only page.

**Preconditions:**
- A user seeded with `scope.modules: ["personnel"]` and an unrelated permission.

### Flow Steps:
1. Open `/personal`.
2. Assert the roster renders.
3. Assert every mutation control is absent.

### Expected Result:
- The list is fully visible.
- `Nuevo empleado` is not rendered.
- The `Acciones` column header is absent, so no `Editar`, `Eliminar`,
  `Activar` or `Desactivar` button exists.

> Note: module `personnel` is derived from `EMPLEADOS_PERFILES_ADMINISTRAR`
> alone in `PERMISSION_TO_MODULE`, so this exact user is not producible by the
> current API. The case pins the two frontend gates independently — the route
> guard checks the module, the controls check the permission.