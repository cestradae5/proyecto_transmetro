# Exploration: Frontend UI to Manage Parada Sequence in Línea

## Current State

### Backend Status
- **Endpoints**: All four endpoints implemented and tested in `apps/api/src/infrastructure/linea/linea.controller.ts`
  - `GET /infrastructure/lineas/:id/paradas` → returns ordered list with `parada` relation populated
  - `POST /infrastructure/lineas/:id/paradas` → adds parada with orden + minutosHastaSiguiente
  - `PATCH /infrastructure/lineas/:id/paradas/:lineaParadaId` → updates orden/minutos
  - `DELETE /infrastructure/lineas/:id/paradas/:lineaParadaId` → removes parada (enforces ≥2 minimum)

- **Error Handling**: Service throws ConflictException with semantic error codes: `PARADA_ALREADY_IN_LINEA`, `ORDEN_DUPLICATE`, `LINEA_MIN_PARADAS`. ApiClient captures `error.data` containing code and message.

- **Response Shape**: Each row from GET returns:
  ```typescript
  {
    idLineaParada: string,
    orden: number,
    minutosHastaSiguiente: number,
    idParada: string,
    idLinea: string,
    parada: {
      idParada: string,
      nombreParada: string,
      latitud: number,
      longitud: number,
      estadoParada: 'ACTIVA' | 'CERRADA' | 'MANTENIMIENTO'
    }
  }
  ```

### Frontend Status
- **Linea Management**: Already exists (LineasTable, LineaDialog, LineaForm) in `apps/admin-web/src/features/infrastructure/components/lineas/`
- **Current Scope**: Tab-based CRUD for Línea master data; detail view does NOT exist
- **Parada Junction UI**: Not yet built; this is the follow-up from infraestructura-hardening (task ~297)

### Integration Points
- **API Client**: `apps/admin-web/src/lib/api-client.ts` — raw fetch wrapper; errors include `status`, `message`, and `data` object
- **Hooks Pattern**: Per-entity hook wrapping fetch/CRUD; example: `useLineas()` in `apps/admin-web/src/features/infrastructure/hooks/use-lineas.ts`
- **Form Pattern**: Controlled component with `useState`, validation object, error display; no react-hook-form, no zod (design decision #1859)
- **Styling**: Tailwind only; forms use `px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary` pattern
- **Dialog Pattern**: Fixed overlay (`fixed inset-0 bg-black/50`), centered white box, form inside with onSave/onClose callbacks

### Type System
- `Linea` interface in `infrastructure.types.ts` already has correct camelCase fields (numeroLinea, colorHex, etc.)
- NEW REQUIRED TYPE: `LineaParada` interface (will be generated from backend or manually defined)
- NEW REQUIRED TYPE: `Parada` interface already exists and matches backend response

## Affected Areas

- `apps/admin-web/src/features/infrastructure/components/lineas/` — new parada-manager component + dialog/form for managing sequence
- `apps/admin-web/src/features/infrastructure/hooks/` — new hook `useLineaParadas(lineaId)` to fetch/add/update/remove paradas
- `apps/admin-web/src/features/infrastructure/types/infrastructure.types.ts` — add `LineaParada` interface
- `apps/admin-web/src/features/infrastructure/index.tsx` — possibly: button to open parada manager from LineasTable OR separate detail route (user decision)
- `apps/admin-web/src/test/infrastructure/` — add parada table/form/dialog spec files (following existing Vitest + Testing Library pattern)

## Approaches

### Approach 1: Parada Manager Dialog (MVP — recommended)
**Description**: Add a "Gestionar paradas" button in LineasTable → opens modal with ordered table of paradas, inline add/remove buttons, edit orden/minutos via inline form or simple modal.

**Pros**:
- Minimal routing changes; modal fits existing dialog pattern
- Reuses established form/dialog patterns
- Fast to build; no new pages/routes
- Edit inline (orden/minutos) via dedicated small form or modal
- Clear entry point from línea list

**Cons**:
- Modal interaction for ordering feels constrained (if reordering many paradas)
- Drag-drop deferred (MVP inline only, as per spec line 166)

**Effort**: Medium (3–4 component files, 1 hook, ~400–500 lines total)

---

### Approach 2: Línea Detail Page with Parada Manager
**Description**: Add React Router detail route `/infrastructure/lineas/:id` with full line info + embedded parada manager table. Parada manager = ordered table with inline actions.

**Pros**:
- Better UX for managing many paradas (dedicated space, not modal)
- Future drag-drop reordering easier to add (page-level component)
- Aligns with spec line 162 ("Detail Page: ...paradas ordered table")
- Scalable for future related data (estaciones, vehicle assignments)

**Cons**:
- Requires routing setup (new route, link from LineasTable)
- More files to create (detail page, route guard if needed)
- Slightly more routing complexity

**Effort**: Medium-High (detail page route + component, parada manager, hook; ~600–800 lines total)

---

### Approach 3: Inline Parada Manager in LineasTable
**Description**: Expand LineasTable rows to include a collapsible/expandable parada sub-table (accordion-style disclosure) within each línea row.

**Pros**:
- No modal or route needed
- All líneas + their paradas visible in one table
- Less context-switching

**Cons**:
- Table UX becomes complex (nested table, multiple expansions)
- Harder to scan parada details clearly
- Harder to edit orden when many lines are expanded

**Effort**: Low-Medium (modifies LineasTable directly; ~300–400 lines)

---

## Recommendation

**Approach 1 (Modal Dialog)** for MVP.

**Reasoning**:
1. **Speed**: Reuses existing dialog/form patterns; minimal learning curve
2. **Scope fits MVP**: Spec explicitly notes "drag-drop optional" (line 166), inline ordering only
3. **UX is clear**: User clicks "Gestionar paradas" → modal opens → sees ordered list + add/remove buttons + simple inline form for editing orden/minutos
4. **Future proof**: Modal stays in place if drag-drop is added later (can embed drag lib inside modal)
5. **Matches existing codebase**: All CRUD dialogs in LineasTable follow this pattern (LineaDialog, ParadaDialog, etc.)

**Second choice**: Approach 2 (detail page) if product wants to scale to 10+ paradas per línea or add related data (estaciones, assignments). More effort but cleaner UX.

---

## Open Questions for User

1. **Placement**: Should the "Gestionar paradas" button appear:
   - In LineasTable's "Acciones" column (like "Editar" and "Eliminar")?
   - In LineasDialog (as a tab or separate section)?
   - Both?

2. **Inline Editing**: When user clicks "Editar" on a parada in the list:
   - Show a small inline form (orden + minutos, 2 inputs + Save/Cancel)?
   - Or open a separate small modal for clarity?

3. **Parada Selection**: When adding a new parada:
   - Show a dropdown of all available paradas (from `paradas` list already loaded in InfrastructurePage)?
   - Or link to "select from Paradas tab"?

4. **Reordering**: MVP or later?
   - MVP: only edit orden via form (swap manually)
   - Later: drag-drop (will need library like react-beautiful-dnd or native HTML5 Drag API)

5. **Detail View**: Would you like a full detail page for Línea (Approach 2), or is modal enough for now?

---

## Risks

1. **Temporary orden hack**: UNIQUE(idLinea, orden) constraint means reordering `orden: 1` → `orden: 2` and `orden: 2` → `orden: 1` requires a temporary free orden (e.g., `orden: 99`, then renumber). Frontend must handle or backend needs atomic reorder endpoint. **Mitigation**: Document the workaround; consider backend reorder endpoint in future.

2. **Error message clarity**: Backend returns codes like `ORDEN_DUPLICATE` in error.data; frontend must map these to user-friendly Spanish messages. **Mitigation**: Create error code → message map in hook or component.

3. **Minimum paradas enforcement**: DELETE endpoint rejects if `<2` remain. Frontend should either:
   - Disable "Eliminar" button when 2 paradas remain, OR
   - Show modal confirmation that warns "Last 2 paradas cannot be deleted"
   - **Mitigation**: Simple check in handleDelete; disable button accordingly.

4. **Type safety**: Need to define `LineaParada` interface in types.ts to match backend response. Missing type will cause runtime errors. **Mitigation**: Add type definition before coding component.

---

## Test Strategy

- **Vitest + React Testing Library** (existing pattern in `src/test/infrastructure/`)
- **Test files to create**:
  - `linea-parada-form.spec.tsx` — validate orden/minutos inputs, error display
  - `linea-parada-table.spec.tsx` — render paradas, test add/remove/edit buttons
  - `linea-parada-dialog.spec.tsx` — open/close, data flow
  - `use-linea-paradas.spec.ts` — hook: fetch, add, update, remove, error handling

- **Test command**: `npm run test` (from apps/admin-web)

- **Coverage target**: 70% (per infraestructura-hardening notes, best-effort)

---

## Ready for Proposal

**Yes.** Scope is clear, backend is complete, frontend patterns are established, and MVP approach is low-risk. Recommend proceeding to Proposal phase with Approach 1 (Modal Dialog) after user answers the 5 open questions above.

---

## Line Estimate (MVP, Approach 1)

| Component | Lines | Notes |
|-----------|-------|-------|
| `use-linea-paradas.ts` hook | 80–100 | Fetch, add, update, remove + error handling |
| `linea-parada-form.tsx` | 100–120 | Inline form: orden, minutos, validation, error display |
| `linea-parada-table.tsx` | 150–180 | Ordered list of paradas, add button, edit/remove actions |
| `linea-parada-dialog.tsx` | 30–40 | Dialog wrapper (small, mirrors LineaDialog pattern) |
| Integration (index.tsx + LineasTable) | 30–50 | Button + conditional dialog render |
| Tests (4 spec files) | 400–500 | Form, table, dialog, hook specs |
| **Total** | **~800–1000** | Excluding tests: ~300–400 lines |

**Risk Level**: Low–Medium. Patterns already exist; main risk is error code mapping and minimum-parada enforcement logic.
