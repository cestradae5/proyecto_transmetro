# Proposal: Frontend UI to Manage Parada Sequence in Línea

## Intent

Enable transit line managers to reorder and adjust parada sequences (journey time between stops) directly from the admin dashboard. Currently, the backend supports full CRUD operations for managing parada sequences in a línea (GET/POST/PATCH/DELETE `/infrastructure/lineas/:id/paradas`), but there is no frontend UI to expose this functionality. This change builds the user-facing modal dialog and forms to manage parada assignment and order inline, closing the feature loop from **infraestructura-hardening** (task ~297).

## Scope

### In Scope
- Modal dialog (`LineaParadaDialog`) triggered by "Gestionar paradas" action button in `LineasTable` actions column
- Ordered parada table with inline row editing (orden + minutosHastaSiguiente inputs)
- Add parada form with dropdown selection (populated from already-loaded paradas, excluding already-assigned)
- Remove parada button with minimum-paradas enforcement (disable/warn when only 2 remain, since removal would leave fewer than the backend minimum of 2)
- Error handling for backend responses (PARADA_ALREADY_IN_LINEA, ORDEN_DUPLICATE, LINEA_MIN_PARADAS)
- Hook (`useLineaParadas`) wrapping all CRUD operations (fetch, add, update, remove)
- Form validation (orden must be positive, minutosHastaSiguiente ≥0)
- Spec-level types: `LineaParada` interface added to `infrastructure.types.ts`
- Test coverage (~400–500 lines): form, table, dialog, and hook specs using Vitest + React Testing Library

### Out of Scope
- Drag-and-drop reordering (MVP: inline manual orden edit only)
- Línea detail page/separate route (modal in LineasTable is sufficient for MVP)
- Backend changes (endpoint contract already delivered in infraestructura-hardening feature branch)
- New dependencies (use existing controlled components + useState; no react-hook-form, no new UI library)

## Capabilities

### New Capabilities
- `linea-parada-manager`: Frontend modal and inline UI to manage parada sequences within a transit line—add, reorder by orden field, adjust travel time, and remove with minimum enforcement.

### Modified Capabilities
- `linea-crud`: Adding "Gestionar paradas" action button to the existing LineasTable; modal entry point only, no spec-level behavior change to línea master data management.

## Approach

**Architecture**: Single modal component (`LineaParadaDialog`) + three focused sub-components (`LineaParadaForm`, `LineaParadaTable`, `LineaParadaAddForm`) + one custom hook (`useLineaParadas`).

1. **Entry Point**: "Gestionar paradas" button in `LineasTable`'s actions column (mirrors "Editar" / "Eliminar" pattern)
2. **Modal Flow**: 
   - Opens with ordered parada table (sorted by orden)
   - Table rows show parada name, orden, minutosHastaSiguiente, with "Editar" and "Eliminar" buttons
   - "Agregar parada" button at table bottom opens inline add form
3. **Inline Editing**: Click "Editar" → row shifts to edit mode (orden and minutosHastaSiguiente inputs + Save/Cancel)
4. **Parada Selection**: Dropdown populated from `useParadas()` hook (already loaded at page level), excluding paradas already in this línea
5. **Error Handling**: Map backend error codes to Spanish user messages (ORDEN_DUPLICATE → "Ya existe una parada con este orden", LINEA_MIN_PARADAS → "Una línea debe tener al menos 2 paradas")
6. **Minimum Enforcement**: When 2 paradas remain, disable "Eliminar" button; show confirmation modal or alert explaining minimum

**Tech Stack**:
- React 19 (no useMemo/useCallback; React Compiler handles optimization)
- Controlled components + `useState` for form state
- Tailwind 4 for styling (no var() in className; semantic color classes)
- Vitest + React Testing Library for specs
- TypeScript strict mode

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/admin-web/src/features/infrastructure/components/lineas/` | New | `linea-parada-dialog.tsx`, `linea-parada-table.tsx`, `linea-parada-form.tsx`, `linea-parada-add-form.tsx` (4 components) |
| `apps/admin-web/src/features/infrastructure/components/lineas/lineas-table.tsx` | Modified | Add "Gestionar paradas" button in actions column; conditional modal render |
| `apps/admin-web/src/features/infrastructure/hooks/` | New | `use-linea-paradas.ts` (custom hook for fetch/add/update/remove + error handling) |
| `apps/admin-web/src/features/infrastructure/types/infrastructure.types.ts` | Modified | Add `LineaParada` interface matching backend response shape |
| `apps/admin-web/src/test/infrastructure/` | New | `linea-parada-dialog.spec.tsx`, `linea-parada-table.spec.tsx`, `linea-parada-form.spec.tsx`, `use-linea-paradas.spec.ts` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Orden reordering constraint** (UNIQUE per línea forces temporary free orden) | Medium | Frontend documents the workaround inline (e.g., allow orden=99 temporarily, then renumber). Backend reorder endpoint deferred to follow-up if many reorderings per session become common. |
| **Error message clarity** (backend codes like ORDEN_DUPLICATE not user-friendly) | Medium | Create error code → Spanish message map in hook or component; test all code paths with mock error responses. |
| **Minimum paradas enforcement UI** (user confusion if delete disabled) | Low | Clear button disable state + explicit modal message ("Cannot remove: línea requires ≥2 paradas"). Test disable logic with ≤3 parada scenarios. |
| **Type safety** (LineaParada interface mismatch with backend) | Low | Add type definition in proposal phase; align with backend response from exploration (idLineaParada, orden, minutosHastaSiguiente, parada relation). Use codegen if available, else manual definition. |
| **Modal data staleness** (paradas list not refreshed when new parada added elsewhere) | Low | Hook calls `refetch()` or re-query after successful POST/PATCH/DELETE; modal re-renders with fresh data. Implement dependency on `lineaId` + success flag. |
| **Code volume** (~300–400 source + ~400–500 test lines) | Medium | May exceed 400-line PR threshold per delivery_strategy=ask-on-risk. Recommend splitting into 2 PRs if final count >400: (1) hook + types + form components, (2) table + dialog + integration. |

## Rollback Plan

1. **Revert changes**: Remove "Gestionar paradas" button from LineasTable actions column (line diff ≤5 lines)
2. **Restore prior state**: Modal render + related components deleted from git; hook and types remain orphaned but harmless
3. **No backend impact**: Backend endpoints remain; they simply stay unused
4. **Timeline**: Rollback completable in <2 minutes (single commit revert)

If a critical bug emerges post-merge (e.g., orden constraint causing data corruption):
- Immediately disable button via feature flag or remove PR commit
- Investigate backend constraint behavior (should be atomic on server side)
- Add test case covering the failure scenario before re-landing

## Dependencies

- **Backend**: Parada relation on GET `/infrastructure/lineas/:id/paradas` must be populated (currently uncommitted on `feature/hardening-pr4-frontend-tests-docs`; will be merged before or concurrent with this change)
- **Frontend State**: `useParadas()` hook must be available in context (already exists in infrastructure module)
- **Type Generation** (optional): If backend generates TypeScript types, sync LineaParada from DTO; else define manually

## Success Criteria

- [ ] Modal opens when "Gestionar paradas" button clicked from LineasTable
- [ ] Ordered parada table renders with all paradas for the selected línea, sorted by orden
- [ ] Add parada form shows dropdown with available paradas (excluding already-assigned)
- [ ] Inline edit form allows updating orden and minutosHastaSiguiente; save and cancel work correctly
- [ ] Delete button removes parada; disabled when 2 remain; confirmation modal warns user of minimum
- [ ] Backend error codes (ORDEN_DUPLICATE, LINEA_MIN_PARADAS, PARADA_ALREADY_IN_LINEA) map to Spanish messages displayed in UI
- [ ] Form validation prevents empty selections and invalid orden/minutos values
- [ ] All 4 spec files pass (form, table, dialog, hook) with ≥70% coverage
- [ ] No new dependencies added; only Tailwind + React hooks
- [ ] Code follows existing module conventions (camelCase identifiers, controlled components, Tailwind styling)
