# Design: Frontend UI to Manage Parada Sequence in Línea

## Technical Approach

Implement the modal-dialog approach (Approach 1 from explore.md) using the four components named in the proposal — `LineaParadaDialog`, `LineaParadaTable`, `LineaParadaForm`, `LineaParadaAddForm` — plus one hook, `useLineaParadas`. All new UI reuses the existing controlled-component + `useState` + Tailwind conventions already present in `apps/admin-web/src/features/infrastructure/components/lineas/` (mirrored from `LineaDialog`/`LineaForm`/`LineasTable`). No new dependencies, no new route.

Two deviations from the existing dialog pattern are required because the spec explicitly demands them (not present in `LineaDialog` today):
1. **Escape key + backdrop click to close** (`linea-parada-manager` spec, "Modal Dialog Container and Lifecycle").
2. **Error-code → Spanish message mapping** (existing hooks just surface `err.message` raw from the backend; this hook must translate `ORDEN_DUPLICATE` / `PARADA_ALREADY_IN_LINEA` / `LINEA_MIN_PARADAS` / 404 / 5xx into the exact Spanish strings the spec requires).

## Architecture Decisions

### Decision: Prop-drill `paradas` from `index.tsx` through `LineasTable` into the dialog (no new context/store)

**Choice**: `InfrastructurePage` already calls `useParadas()` and holds `paradas: Parada[]` in memory for the "Paradas" tab. Pass that same array as a new `paradas` prop to `<LineasTable>`, which forwards it to `<LineaParadaDialog>`.

**Alternatives considered**:
- Have `LineaParadaDialog` call its own `useParadas()` instance → duplicate fetch, duplicate loading state, and a second network round-trip every time the dialog opens.
- Introduce a shared context/store for infrastructure data → new architectural surface not justified by one feature; contradicts "no new deps" and the codebase's flat prop-passing convention (every existing dialog receives its cross-entity data as props, e.g. `EstacionDialog` receives `paradas`, `AfectacionDialog` receives `paradas` + `estaciones`).

**Rationale**: Matches the exact pattern already used for `EstacionDialog`/`AfectacionDialog` (both receive already-loaded sibling-entity arrays as props). Zero new fetches, zero new state containers, one-line change in `index.tsx`.

### Decision: `LineaParadaDialog` owns modal lifecycle + hook instantiation; `LineasTable` owns *whether* it is open

**Choice**: `LineasTable` adds local state `managingLinea: Linea | null` (same shape as existing `editingLinea`) and conditionally renders `<LineaParadaDialog linea={managingLinea} paradas={paradas} onClose={...} />`. The dialog itself calls `useLineaParadas(linea.idLinea)` internally — the hook is only ever instantiated while the dialog is mounted, so `lineaId` is always defined at hook-call time (no `null` branch needed inside the hook).

**Alternatives considered**: Instantiate `useLineaParadas` in `LineasTable` (or `index.tsx`) unconditionally and pass an optional `lineaId` down — rejected because it would force every render of `LineasTable` to fetch/hold parada-sequence state even when the dialog is closed, and would require a nullable-`lineaId` branch inside the hook (extra complexity for no benefit — the existing `LineaDialog`/`editingLinea` pattern already proves conditional mount is the established convention).

**Rationale**: Consistent with `isDialogOpen && editingLinea && <LineaDialog .../>` already in `LineasTable`; keeps `useLineaParadas`'s type signature simple (`lineaId: string`, never `string | null`).

### Decision: Row-level edit state lives in `LineaParadaTable`, not in the hook or the dialog

**Choice**: `LineaParadaTable` holds `editingId: string | null` (`idLineaParada`). When a row's id matches `editingId`, render `<LineaParadaForm>` in place of the read-only cells for that row; otherwise render read-only cells + "Editar"/"Eliminar" buttons.

**Alternatives considered**: Track edit state in `LineaParadaDialog` and pass `editingId`/`setEditingId` down as props — rejected as unnecessary prop-threading; the edit toggle is pure row-local UI state with no cross-component consumer.

**Rationale**: Single-responsibility — the hook owns server state and mutations; the dialog owns modal chrome and error banner; the table owns which row is being edited. Mirrors how `LineasTable` itself owns `editingLinea`/`isDialogOpen` rather than pushing that state up to `index.tsx`.

### Decision: Hook mutation methods pre-translate errors; components never call the error-mapping function directly

**Choice**: `useLineaParadas`'s `addParada`, `updateParada`, `removeParada`, and the initial `fetchLineaParadas` all catch `ApiError`, run it through an internal `mapLineaParadaError(err)` function, and re-throw/`setError` with the **already-Spanish** message. `mapLineaParadaError` is still exported from the hook module so `use-linea-paradas.spec.ts` can unit-test the mapping table directly, but `LineaParadaForm`/`LineaParadaAddForm` consume it the same way `LineaForm` already consumes hook errors today: `catch (err: any) { setErrors({ submit: err.message }) }`.

**Alternatives considered**: Have each form component import `mapLineaParadaError` and call it itself on catch — rejected because it would duplicate the translation call in three places (add form, edit form, dialog-level fetch error) and could drift if only some call sites remember to translate.

**Rationale**: Keeps the existing `err.message`-in-`catch` idiom from `LineaForm`/`ParadaForm` unchanged for consumers; centralizes the one piece of genuinely new logic (code→message table) in the hook, where the spec's "Error Code Mapping" table lives conceptually.

### Decision: `LineaParada.idParada` is `string` on the wire; the dropdown must convert `Parada.idParada` (existing `number` type) when building the POST body

**Choice**: Keep `Parada.idParada: number` untouched in `infrastructure.types.ts` (it is used across four other existing components; changing it is out of scope and would risk regressions). Define the new `LineaParada` type with `idParada: string` / `idLinea: string`, matching the backend's actual bigint-as-string serialization (confirmed in `apps/api/src/infrastructure/linea/dto/add-linea-parada.dto.ts`: `@IsString() idParada!: string;` and `linea-parada.entity.ts`: `idParada!: string`). `LineaParadaAddForm` converts with `String(parada.idParada)` both when filtering the dropdown (excluding already-assigned paradas) and when building the POST payload.

**Alternatives considered**: Normalize `Parada.idParada` to `string` everywhere for consistency — rejected as out of scope (touches `ParadasTable`, `ParadaForm`, `EstacionesTable`, `AfectacionesTable`, and their specs; a much larger, unrelated refactor).

**Rationale**: `ParadaEntity.idParada` is declared `number` in the backend TypeScript class despite the underlying column being `bigint` (pre-existing inconsistency, not introduced by this change — see Open Questions). `LineaParadaEntity.idParada` and `AddLineaParadaDto.idParada` are declared `string`. The frontend type must match what actually arrives over HTTP for the resource it types, not force consistency with an unrelated existing type.

### Decision: Backend error "code" is delivered in the JSON body's `error` field, not a `code` field — the mapping function must read `err.data.error`

**Choice**: `mapLineaParadaError` reads `(err as ApiError).data?.error` for the machine-readable code, and `(err as ApiError).status` for the HTTP status. This was verified against `apps/api/src/infrastructure/linea/linea.service.spec.ts` line 68-70, which asserts `error.getResponse().error === "ORDEN_DUPLICATE"` for Nest's built-in `ConflictException(message, code)` — Nest's default `HttpException` body shape is `{ statusCode, message, error }`, and `apiClient.handleResponse` forwards the full parsed JSON as `ApiError.data`.

**Alternatives considered**: Assume a `data.code` field (as the proposal's prose loosely suggested) — verified against actual backend code and rejected; would silently fail to match any error and always fall through to the generic 5xx message.

**Rationale**: This is a factual verification, not a preference — using the wrong field name would make every 409 scenario in the spec (`ORDEN_DUPLICATE`, `PARADA_ALREADY_IN_LINEA`, `LINEA_MIN_PARADAS`) silently degrade to "Error de conexión. Por favor, intente de nuevo." instead of the specific Spanish message the spec requires.

## Data Flow

    InfrastructurePage (index.tsx)
      useParadas() ──> paradas: Parada[] ───────────────┐
      useLineas()  ──> lineas, updateLinea, deleteLinea  │
           │                                             │
           ▼                                             ▼
      <LineasTable lineas parqueos paradas onUpdate onDelete>
           │  owns: managingLinea (Linea | null)
           │  new button: "Gestionar paradas" → setManagingLinea(linea)
           ▼
      <LineaParadaDialog linea={managingLinea} paradas={paradas} onClose>
           │  calls useLineaParadas(linea.idLinea)
           │
           ├─ GET  /infrastructure/lineas/{id}/paradas  ──> lineaParadas: LineaParada[]
           │
           ▼
      <LineaParadaTable lineaParadas onEdit onRemove>
           │  owns: editingId (string | null)
           │  row in edit mode ──> <LineaParadaForm lineaParada onSave onCancel>
           │                            └─ PATCH /infrastructure/lineas/{id}/paradas/{lineaParadaId}
           │  "Eliminar" (disabled when lineaParadas.length <= 2)
           │                            └─ DELETE /infrastructure/lineas/{id}/paradas/{lineaParadaId}
           ▼
      <LineaParadaAddForm availableParadas={paradas minus assigned} onAdd>
                                        └─ POST /infrastructure/lineas/{id}/paradas

      Every mutation success ──> hook.refresh() ──> re-GET ──> table re-renders re-sorted by orden
      Every mutation failure ──> mapLineaParadaError(err) ──> Spanish message surfaces in the
                                  form's local error (add/edit) or the dialog's error banner (fetch)

## File Changes

| File | Action | Description | Est. lines |
|------|--------|-------------|-----------:|
| `apps/admin-web/src/features/infrastructure/types/infrastructure.types.ts` | Modify | Add `LineaParada`, `CreateLineaParadaDto` (`{ idParada: string; orden: number; minutosHastaSiguiente: number }`), `UpdateLineaParadaDto` (`Partial<Pick<CreateLineaParadaDto, 'orden' \| 'minutosHastaSiguiente'>>`) | 10–14 |
| `apps/admin-web/src/features/infrastructure/hooks/use-linea-paradas.ts` | Create | `useLineaParadas(lineaId)` hook: fetch/add/update/remove + `mapLineaParadaError` (exported for direct unit testing) | 110–130 |
| `apps/admin-web/src/features/infrastructure/components/lineas/linea-parada-form.tsx` | Create | Inline per-row edit form: orden + minutosHastaSiguiente inputs, validation, Guardar/Cancelar | 85–100 |
| `apps/admin-web/src/features/infrastructure/components/lineas/linea-parada-add-form.tsx` | Create | Dropdown (available paradas) + orden + minutos inputs, validation, Agregar | 90–110 |
| `apps/admin-web/src/features/infrastructure/components/lineas/linea-parada-table.tsx` | Create | Ordered table, loading/empty states, row edit-mode toggle, delete w/ min-2 disable + `confirm()` gate | 130–160 |
| `apps/admin-web/src/features/infrastructure/components/lineas/linea-parada-dialog.tsx` | Create | Modal shell (title, X, "Cerrar"), Escape-key + backdrop-click close, composes table + add form + error banner | 90–115 |
| `apps/admin-web/src/features/infrastructure/components/lineas/lineas-table.tsx` | Modify | New `paradas` prop, `managingLinea` state, "Gestionar paradas" button (always enabled), conditional dialog render | +20–25 |
| `apps/admin-web/src/features/infrastructure/index.tsx` | Modify | Pass `paradas={paradas}` to `<LineasTable>` | +1 |
| `apps/admin-web/src/test/infrastructure/use-linea-paradas.spec.ts` | Create | fetch success/loading/error; add/update/remove success; all 3 code mappings + 404 + generic 5xx mapping | 110–130 |
| `apps/admin-web/src/test/infrastructure/linea-parada-form.spec.tsx` | Create | Pre-fill from `lineaParada`; validation (orden ≤0, minutos <0); save calls `onSave`; cancel reverts w/o calling save | 80–100 |
| `apps/admin-web/src/test/infrastructure/linea-parada-add-form.spec.tsx` | Create | Dropdown excludes assigned paradas; validation; `onAdd` called with string `idParada`; error display | 90–110 |
| `apps/admin-web/src/test/infrastructure/linea-parada-table.spec.tsx` | Create | Renders sorted rows; loading/empty state; edit toggle swaps row to form; delete disabled at exactly 2 remaining, enabled at 3+ | 110–140 |
| `apps/admin-web/src/test/infrastructure/linea-parada-dialog.spec.tsx` | Create | Title includes línea nombre; closes on X / "Cerrar" / backdrop click / Escape; fetch-error banner renders mapped message | 90–115 |

**Total source**: ~505–655 lines · **Total tests**: ~480–595 lines · **Grand total**: ~985–1250 lines.

**Note on the 400-line review policy**: this total exceeds the session's 400-changed-line review threshold even before counting either range's midpoint. See "Migration / Rollout" below for the recommended multi-PR split — flagged explicitly per `delivery_strategy: ask-on-risk`.

## Interfaces / Contracts

```typescript
// infrastructure.types.ts additions

export interface LineaParada {
  idLineaParada: string;
  orden: number;
  minutosHastaSiguiente: number;
  idParada: string;   // bigint on the wire — string, NOT the number used by Parada.idParada
  idLinea: string;
  parada: Parada;      // nested relation, always populated by GET (per linea.service.ts listParadas)
}

export type CreateLineaParadaDto = {
  idParada: string;
  orden: number;
  minutosHastaSiguiente: number;
};

export type UpdateLineaParadaDto = Partial<
  Pick<CreateLineaParadaDto, 'orden' | 'minutosHastaSiguiente'>
>;
```

```typescript
// use-linea-paradas.ts

export interface UseLineaParadasResult {
  lineaParadas: LineaParada[];
  loading: boolean;
  error: string | null;          // already-mapped Spanish message, or null
  refresh: () => Promise<void>;
  addParada: (data: CreateLineaParadaDto) => Promise<LineaParada>;
  updateParada: (lineaParadaId: string, data: UpdateLineaParadaDto) => Promise<LineaParada>;
  removeParada: (lineaParadaId: string) => Promise<void>;
}

export function useLineaParadas(lineaId: string): UseLineaParadasResult;

/** Exported for direct unit testing of the code→message table. */
export function mapLineaParadaError(err: unknown): string;
```

```typescript
// mapLineaParadaError behavior (verified against apps/api/.../linea.service.ts + linea.service.spec.ts)
// ApiError.data shape on the wire: { statusCode: number, message: string, error: string }
//   - err.data.error   -> machine code, e.g. "ORDEN_DUPLICATE"  (NOT "code")
//   - err.status       -> HTTP status
//
// 404  -> "El recurso solicitado no existe o fue eliminado"
// 409 + data.error === 'PARADA_ALREADY_IN_LINEA' -> "Esta parada ya está asignada a la línea"
// 409 + data.error === 'ORDEN_DUPLICATE'         -> "Ya existe una parada con este orden en la línea"
// 409 + data.error === 'LINEA_MIN_PARADAS'       -> "Una línea debe tener al menos 2 paradas"
// anything else (network error, 5xx, unrecognized code) -> "Error de conexión. Por favor, intente de nuevo."
```

```typescript
// Component prop shapes

interface LineaParadaDialogProps {
  linea: Linea;
  paradas: Parada[];       // full loaded list from index.tsx, forwarded through LineasTable
  onClose: () => void;
}

interface LineaParadaTableProps {
  lineaParadas: LineaParada[];
  loading: boolean;
  onUpdate: (lineaParadaId: string, data: UpdateLineaParadaDto) => Promise<LineaParada>;
  onRemove: (lineaParadaId: string) => Promise<void>;
}

interface LineaParadaFormProps {
  lineaParada: LineaParada;
  onSave: (data: UpdateLineaParadaDto) => Promise<void>;
  onCancel: () => void;
}

interface LineaParadaAddFormProps {
  availableParadas: Parada[];  // paradas minus already-assigned, computed by the dialog
  onAdd: (data: CreateLineaParadaDto) => Promise<void>;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — hook | Fetch success/loading/error; add/update/remove success paths; each of the 5 error-mapping branches (`PARADA_ALREADY_IN_LINEA`, `ORDEN_DUPLICATE`, `LINEA_MIN_PARADAS`, 404, generic 5xx) | Vitest + mocked `apiClient` module (`vi.mock('../../../lib/api-client')`), matching the existing hook-testing gap: no hook specs exist yet in this codebase, so this establishes the pattern other hooks lack today |
| Unit — form components | `LineaParadaForm`: pre-fill, orden/minutos validation, save/cancel; `LineaParadaAddForm`: dropdown exclusion, validation, payload shape (`idParada` as string) | Vitest + React Testing Library, querying inputs by type/order (no `htmlFor`/`id` association exists anywhere in this codebase's forms — same documented caveat as `linea-form.spec.tsx`) |
| Unit — table component | Sorted render, loading/empty states, edit-mode toggle, delete-button disabled exactly at 2 remaining / enabled at 3+ | RTL; mock `onUpdate`/`onRemove` as `vi.fn()` |
| Integration — dialog | Open/close via X, "Cerrar", backdrop click, Escape key; error banner shows mapped message on fetch failure; composes table + add form with live hook (mocked `apiClient`) | RTL with mocked `apiClient`, following the same module-mock strategy as the hook spec |
| Manual / smoke | End-to-end click-through: LineasTable → "Gestionar paradas" → add/edit/remove → close → table reflects changes | No Playwright E2E in scope per proposal (`Out of Scope`); manual verification only |

**Test command**: `npm run test` from `apps/admin-web` (root `package.json` also exposes `npm run test --workspaces --if-present` from the repo root). Scope to this feature during development with `npm run test -- linea-parada` (Vitest substring filter) from `apps/admin-web`.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This change is a client-side modal UI consuming an already-deployed, already-tested REST contract; no new attack surface is introduced (auth/permissions are enforced server-side by the existing `AuthenticationGuard` + `INFRAESTRUCTURA_GESTIONAR` permission on every `:id/paradas` route, unchanged by this proposal).

## Migration / Rollout

No data migration. No feature flag needed — this is additive UI behind a new button; nothing existing changes behavior.

**Recommended PR split** (the estimated ~985–1250 total changed lines exceeds the session's 400-line review policy; proposal.md's own risk table already anticipated this):

- **PR 1 — Foundations** (~360–420 lines): `infrastructure.types.ts` additions, `use-linea-paradas.ts`, `use-linea-paradas.spec.ts`. Reviewable in isolation: pure data/error-mapping logic, no UI.
- **PR 2 — Row-level forms** (~345–420 lines): `linea-parada-form.tsx`, `linea-parada-add-form.tsx`, their two spec files. Depends on PR 1's types (not its runtime code — forms take callbacks as props, so they can be written/reviewed against PR 1's exported types alone).
- **PR 3 — Table + Dialog + integration** (~280–345 lines): `linea-parada-table.tsx`, `linea-parada-dialog.tsx`, their two spec files, plus the `lineas-table.tsx` + `index.tsx` integration changes. Depends on PR 1 and PR 2 landing first.

Each PR stays under or close to the 400-line threshold individually; sdd-tasks should assign tasks along these three groupings so `work-unit-commits` conventions and the review policy stay satisfied without artificially fragmenting logically-coupled files (e.g., a component is never split from its own spec file).

**Rollback**: per proposal.md — revert the `lineas-table.tsx` button + dialog-render lines (≤5-line diff) to disable the entry point instantly; the hook/types/other components remain orphaned but harmless until the next revert removes them too.

## Open Questions

- [ ] **Pre-existing type inconsistency, not introduced here**: `Parada.idParada` is typed `number` in `infrastructure.types.ts` (matching `ParadaEntity.idParada: number` in the backend TS class), but the underlying column is `bigint` and every *other* bigint PK in this schema (`Linea.idLinea`, `LineaParada.idParada`/`idLinea`) is typed `string`. This design does not change `Parada.idParada` (out of scope, would touch 4+ unrelated files) but works around it with explicit `String(...)` conversions at the two call sites that need it (dropdown filtering, POST payload). Flagging in case product/eng wants a follow-up cleanup ticket.
- [ ] **Orden-swap UX**: per spec's "Known Limitations", swapping two paradas' `orden` (e.g., 1↔2) requires a temporary free value because of the `UNIQUE(idLinea, orden)` constraint. This design does not add special swap-assistance UI (matches spec: "SHOULD document this behavior in a help tooltip") — confirm a static help-text tooltip in `LineaParadaTable` is sufficient for MVP, or whether product wants this deferred entirely to a future reorder endpoint.
