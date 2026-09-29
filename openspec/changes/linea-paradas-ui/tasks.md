# Tasks: Frontend UI to Manage Parada Sequence in Línea

## Prerequisites

- [x] 0.1 Commit the backend change on `feature/hardening-pr4-frontend-tests-docs`: `listParadas` now loads `relations: { parada: true }` (linea.service.ts, linea.service.spec.ts, linea.controller.ts). This is a dependency for PR 3's integration tests. Verification: `npm test -w apps/api -- linea` (50/50 pass). Rollback: `git revert` the commit.

**Commit**: 276d193 (delivered in chain PR 01-data-layer)

> Commit SHAs below were rewritten when the work was split into the feature-branch chain `feature/linea-paradas-ui-01..05`; code content is unchanged.

## PR 1 — Foundations (types + hook + error mapping)

**Goal**: Establish the data layer — types, hook, and error translation — with full unit test coverage. No UI in this slice.

- [x] 1.1 Add `LineaParada`, `CreateLineaParadaDto`, `UpdateLineaParadaDto` interfaces to `apps/admin-web/src/features/infrastructure/types/infrastructure.types.ts`. `LineaParada.idParada` and `idLinea` are `string` (bigint on the wire); `parada: Parada` is the nested relation.
- [x] 1.2 Create `apps/admin-web/src/features/infrastructure/hooks/use-linea-paradas.ts`: `useLineaParadas(lineaId: string)` hook with `lineaParadas`, `loading`, `error`, `refresh()`, `addParada()`, `updateParada()`, `removeParada()`. Export `mapLineaParadaError(err: unknown): string` for direct unit testing. Error mapping reads `ApiError.data.error` (NOT `data.code`) and `ApiError.status`. 404 → generic message; 409 codes → specific Spanish messages; everything else → connection error message.
- [x] 1.3 Create `apps/admin-web/src/test/infrastructure/use-linea-paradas.spec.ts`: mock `apiClient` module. Test fetch success/loading/error; add/update/remove success paths; all 5 error-mapping branches (PARADA_ALREADY_IN_LINEA, ORDEN_DUPLICATE, LINEA_MIN_PARADAS, 404, generic 5xx).
- [x] 1.4 Work-unit commit: `feat(infrastructure): add useLineaParadas hook with error mapping`

**Commit**: fdbdb3d (chain PR 01-data-layer)

**Verification**: `npm run test -- linea-parada` from `apps/admin-web` (only the hook spec runs).
**Rollback**: `git revert` the work-unit commit.

## PR 2 — Row-level forms

**Goal**: Build the two form components (inline edit + add) with full test coverage. Depends on PR 1's types only (forms take callbacks as props).

- [x] 2.1 Create `apps/admin-web/src/features/infrastructure/components/lineas/linea-parada-form.tsx`: inline per-row edit form. Props: `lineaParada: LineaParada`, `onSave: (data: UpdateLineaParadaDto) => Promise<void>`, `onCancel: () => void`. Pre-fills orden + minutosHastaSiguiente from `lineaParada`. Validates orden > 0 and minutosHastaSiguiente ≥ 0. Guardar/Cancelar buttons.
- [x] 2.2 Create `apps/admin-web/src/test/infrastructure/linea-parada-form.spec.tsx`: pre-fill from lineaParada; validation (orden ≤ 0, minutos < 0); save calls `onSave` with correct payload; cancel reverts without calling save.
- [x] 2.3 Create `apps/admin-web/src/features/infrastructure/components/lineas/linea-parada-add-form.tsx`: dropdown of available paradas + orden + minutos inputs. Props: `availableParadas: Parada[]`, `onAdd: (data: CreateLineaParadaDto) => Promise<void>`. Converts `Parada.idParada` (number) to string via `String()` for the POST payload. Validates all fields.
- [x] 2.4 Create `apps/admin-web/src/test/infrastructure/linea-parada-add-form.spec.tsx`: dropdown excludes assigned paradas; validation; `onAdd` called with string `idParada`; error display.
- [x] 2.5 Work-unit commit: `feat(infrastructure): add linea-parada form components`

**Commit**: 275e2d5 (plus follow-up fix 1120f94 for a `noUncheckedIndexedAccess` typecheck error discovered while building PR 3)

**Verification**: `npm run test -- linea-parada` from `apps/admin-web`.
**Rollback**: `git revert` the work-unit commit.

## PR 3 — Table + Dialog + integration

**Goal**: Build the table and dialog components, integrate into LineasTable, and wire everything together. Depends on PR 1 and PR 2.

- [x] 3.1 Create `apps/admin-web/src/features/infrastructure/components/lineas/linea-parada-table.tsx`: ordered table with loading/empty states. Props: `lineaParadas: LineaParada[]`, `loading: boolean`, `onUpdate`, `onRemove`. Owns `editingId: string | null` state. Row in edit mode renders `LineaParadaForm`. Delete button disabled when `lineaParadas.length <= 2`. `confirm()` gate before delete.
- [x] 3.2 Create `apps/admin-web/src/test/infrastructure/linea-parada-table.spec.tsx`: renders sorted rows; loading/empty state; edit toggle swaps row to form; delete disabled at exactly 2 remaining, enabled at 3+.
- [x] 3.3 Create `apps/admin-web/src/features/infrastructure/components/lineas/linea-parada-dialog.tsx`: modal shell with title "Gestionar paradas: {línea nombre}", X close button, "Cerrar" button. Props: `linea: Linea`, `paradas: Parada[]`, `onClose: () => void`. Calls `useLineaParadas(linea.idLinea)` internally. Escape key + backdrop click to close. Composes `LineaParadaTable` + `LineaParadaAddForm` + error banner. Computes `availableParadas` by filtering out already-assigned paradas.
- [x] 3.4 Create `apps/admin-web/src/test/infrastructure/linea-parada-dialog.spec.tsx`: title includes línea nombre; closes on X / "Cerrar" / backdrop click / Escape; fetch-error banner renders mapped message.
- [x] 3.5 Modify `apps/admin-web/src/features/infrastructure/components/lineas/lineas-table.tsx`: add `paradas: Parada[]` prop; add `managingLinea: Linea | null` state; add "Gestionar paradas" button (always enabled, including INACTIVA); conditionally render `<LineaParadaDialog>`.
- [x] 3.6 Modify `apps/admin-web/src/features/infrastructure/index.tsx`: pass `paradas={paradas}` to `<LineasTable>`.
- [x] 3.7 Work-unit commit: `feat(infrastructure): add linea-parada table, dialog, and integration`

**Commit**: 04d7a4c table (chain PR 03-table) + 66adfcc dialog and integration (chain PR 04-dialog)

**Verification**: `npm run test -- linea-parada` from `apps/admin-web` (all 5 spec files pass).
**Rollback**: Revert the `lineas-table.tsx` button + dialog-render lines (≤5-line diff) to disable the entry point instantly.

## Follow-up — Design conformance

- [x] 4.1 `addParada`/`updateParada`/`removeParada` in `use-linea-paradas.ts` catch errors and re-throw `new Error(mapLineaParadaError(err))`, per design decision "Hook mutation methods pre-translate errors". Previously they threw the raw `ApiError`, so 409 conflicts showed backend text instead of the spec's Spanish messages. Covered by 3 new rejection tests in `use-linea-paradas.spec.ts`.
- [x] 4.2 Work-unit commit: `fix(infrastructure): translate linea-parada mutation errors in hook`

**Commit**: 5feb4e8 (chain PR 05-error-translation)

**Verification**: `npx vitest run` from `apps/admin-web` (14 files, 82 tests pass); `npx tsc -b --force --noEmit` clean.

## Review Workload Forecast

| Slice | Source lines | Test lines | Total |
|-------|-------------|-----------|-------|
| PR 1 — Foundations | ~120–145 | ~110–130 | ~230–275 |
| PR 2 — Row forms | ~175–210 | ~170–210 | ~345–420 |
| PR 3 — Table + Dialog + integration | ~240–275 | ~200–255 | ~440–530 |
| **Total** | **~535–630** | **~480–595** | **~1015–1225** |

- **Chained PRs recommended**: Yes
- **400-line budget risk**: High (total ~1015–1225 lines)
- **Decision needed before apply**: Yes — confirm chain strategy (stacked-to-main vs feature-branch-chain) per delivery_strategy=ask-on-risk

## Chain Strategy Options

- **stacked-to-main**: Each PR merges to main in order. Fast iteration, fix on the go. Best for speed-first teams and independent slices.
- **feature-branch-chain**: The feature/tracker branch accumulates final integration; PR1 targets the tracker branch, later child PRs target the immediate previous PR branch so review diffs stay focused. Only the tracker merges to main. Best for rollback control and coordinated releases.
