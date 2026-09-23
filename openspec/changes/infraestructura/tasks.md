# Tasks: Infrastructure Module (Gestión de Infraestructura)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1200–1500 lines (backend ~700, frontend ~500, configs ~50–100) |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | PR 1 (Setup + Backend Foundation) → PR 2 (Backend CRUD) → PR 3 (Frontend) → PR 4 (Integration) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

**Decision needed before apply: Yes**
**Chained PRs recommended: Yes**
**Chain strategy: stacked-to-main**
**400-line budget risk: High**

## Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Setup: dependencies, module scaffold, shared validation layer | PR 1 | `npm test -w api -- infrastructure.module.spec` | Bootstrap test verifies `InfrastructureModule` registers; Swagger schema loads | Delete `infrastructure/` folder, revert `app.module.ts` imports |
| 2 | Backend CRUD: Parada/Estación/Parqueo/Línea/Afectación services + controllers | PR 2 | `npm test -w api -- infrastructure.*.spec` + `curl http://localhost:3000/infrastructure/paradas` | Swagger UI accessible at `/swagger`; manual curl tests against test DB | Revert `infrastructure/` controllers/services; data persists |
| 3 | Frontend pages & hooks: all List/Detail/Form components for 5 entities | PR 3 | `npm test -w admin-web -- infrastructure/` | Manual test in browser: navigate to `/infrastructure/paradas`, see empty list | Delete `features/infrastructure/`, remove route from app.tsx |
| 4 | Integration: landing-page navigation, permission guards, end-to-end verification | PR 4 | `npm test -w admin-web -- landing-page.spec` + manual e2e flow | Full flow: login → click "Infrastructure" → CRUD one entity → verify changes | Revert landing-page link, remove `/infrastructure` route guard |

---

## Phase 1: Setup & Foundation (Backend Infrastructure)

- [ ] 1.1 Install new dependencies: `npm install class-validator class-transformer @nestjs/swagger` (in workspace root)
- [ ] 1.2 Create `apps/api/src/infrastructure/` folder structure with `infrastructure.module.ts`, `infrastructure.controller.ts`, `infrastructure.service.ts`
- [ ] 1.3 Create `apps/api/src/infrastructure/entities/` with placeholder entity classes (parada, estacion, parqueo, linea, afectacion)
- [ ] 1.4 Create `apps/api/src/infrastructure/shared/domain-exception.filter.ts` (maps typed errors → HTTP codes per design Decision #5)
- [ ] 1.5 Create `apps/api/src/infrastructure/shared/pagination.dto.ts` (reusable pagination request/response)
- [ ] 1.6 Register `InfrastructureModule` in `apps/api/src/app.module.ts` imports
- [ ] 1.7 Add global `ValidationPipe` to `apps/api/src/main.ts` (required for `class-validator` DTOs)
- [ ] 1.8 Add `@nestjs/swagger` configuration to `apps/api/src/main.ts`

---

## Phase 2: Backend Entity Implementation (Parada)

- [ ] 2.1 Create `apps/api/src/infrastructure/parada/parada.entity.ts` (TypeORM entity mapping `tbl_parada`)
- [ ] 2.2 Create `apps/api/src/infrastructure/parada/dto/create-parada.dto.ts` with validators: `nombre` (1–100, unique), `latitud` (±90), `longitud` (±180), `estado` enum
- [ ] 2.3 Create `apps/api/src/infrastructure/parada/dto/update-parada.dto.ts` (partial fields)
- [ ] 2.4 Create `apps/api/src/infrastructure/parada/dto/parada-response.dto.ts` (for responses)
- [ ] 2.5 Create `apps/api/src/infrastructure/parada/parada.contracts.ts` (typed domain errors: `ParadaNameDuplicate`, `ParadaInUse`, `InvalidCoordinates`)
- [ ] 2.6 Create `apps/api/src/infrastructure/parada/parada.service.ts` with methods: `create()`, `findAll()`, `findOne()`, `update()`, `delete()` (soft-delete to `estado='CERRADA'`; validation per spec scenarios)
- [ ] 2.7 Create `apps/api/src/infrastructure/parada/parada.controller.ts` with endpoints: `POST /infrastructure/paradas`, `GET /infrastructure/paradas`, `GET /infrastructure/paradas/:id`, `PATCH /infrastructure/paradas/:id`, `DELETE /infrastructure/paradas/:id`; guard all with `@RequirePermission('INFRAESTRUCTURA_GESTIONAR')`
- [ ] 2.8 Write `apps/api/src/infrastructure/parada/__tests__/parada.service.spec.ts` (test all validation scenarios from spec: duplicate name, invalid coords, in-use rejection)
- [ ] 2.9 Write `apps/api/src/infrastructure/parada/__tests__/parada.controller.spec.ts` (test permission guards, 201/400/404/409 responses)
- [ ] 2.10 Write `apps/api/src/infrastructure/parada/__tests__/parada.integration.spec.ts` (real DB, transactional rollback)

---

## Phase 3: Backend Entity Implementation (Estación)

- [ ] 3.1 Create `apps/api/src/infrastructure/estacion/estacion.entity.ts` (includes optional FK to `tbl_parada`)
- [ ] 3.2–3.10 Repeat 2.2–2.9 pattern for Estación: DTOs, service, controller, contracts (3 files + 3 tests); FK validation to `tbl_parada`, uniqueness check on `id_parada`

---

## Phase 4: Backend Entity Implementation (Parqueo)

- [ ] 4.1 Create `apps/api/src/infrastructure/parqueo/parqueo.entity.ts` (FK to `tbl_estacion`)
- [ ] 4.2–4.10 Repeat 2.2–2.9 pattern for Parqueo: DTOs, service, controller, contracts (3 files + 3 tests); FK to estación, capacity validation (≥0)

---

## Phase 5: Backend Entity Implementation (Línea)

- [ ] 5.1 Create `apps/api/src/infrastructure/linea/linea.entity.ts` (FK to `tbl_parqueo`, relationship to `tbl_linea_parada`)
- [ ] 5.2–5.10 Repeat 2.2–2.9 for Línea; add extra validation: unique `numero_linea`, hex color format, tipo_recorrido enum
- [ ] 5.11 Add methods to `linea.service.ts`: `addParada(lineaId, paradaId, orden, minutos)`, `updateParadaOrder()`, `removeParada()` with ≥2 paradas constraint
- [ ] 5.12 Add endpoints to `linea.controller.ts`: `POST /infrastructure/lineas/:id/paradas`, `PATCH /infrastructure/lineas/:id/paradas/:lineaParadaId`, `DELETE /infrastructure/lineas/:id/paradas/:lineaParadaId`
- [ ] 5.13 Write service tests for junction-table logic (orden uniqueness, min paradas, transactional updates)
- [ ] 5.14 Write controller tests for parada-management endpoints

---

## Phase 6: Backend Entity Implementation (Afectación)

- [ ] 6.1 Create `apps/api/src/infrastructure/afectacion/afectacion.entity.ts` (no direct FK; XOR constraint: `id_parada` XOR `id_estacion`)
- [ ] 6.2 Create class-level validator for Afectación DTO enforcing XOR (custom `@ValidateIf` chain or class-level validator callback)
- [ ] 6.3–6.10 Repeat 2.2–2.9 pattern for Afectación; extra validation: date range (fecha_fin ≥ fecha_inicio), XOR location check, estado enum
- [ ] 6.11 Add service method: `close(afectacionId)` (PATCH estado→'CERRADA', set fecha_fin to now)
- [ ] 6.12 Write tests for XOR validation, date validation, state transitions

---

## Phase 7: Frontend Setup & Shared Components

- [ ] 7.1 Create `apps/admin-web/src/features/infrastructure/` folder structure with `index.ts`, `routes.tsx`, `pages/`, `components/`, `hooks/`
- [ ] 7.2 Create `apps/admin-web/src/features/infrastructure/components/StatusBadge.tsx` (reusable estado/status display for all entities)
- [ ] 7.3 Create `apps/admin-web/src/features/infrastructure/components/EntitySelector.tsx` (nav between 5 entity types)
- [ ] 7.4 Create `apps/admin-web/src/features/infrastructure/pages/InfrastructureDashboard.tsx` (landing page listing all 5 entities)
- [ ] 7.5 Create `apps/admin-web/src/features/infrastructure/routes.tsx` (nested routes: `/infrastructure`, `/infrastructure/paradas`, etc.)
- [ ] 7.6 Update `apps/admin-web/src/app.tsx` to include infrastructure routes under existing `AuthenticationGuard`

---

## Phase 8: Frontend Parada Module

- [ ] 8.1 Create `apps/admin-web/src/features/infrastructure/hooks/useParadas.ts` (fetch all, by id, create, update, delete via `/infrastructure/paradas` endpoints)
- [ ] 8.2 Create `apps/admin-web/src/features/infrastructure/components/ParadaForm.tsx` (controlled form: nombre, latitud, longitud, estado dropdowns; client-side validation mirroring DTOs)
- [ ] 8.3 Create `apps/admin-web/src/features/infrastructure/pages/ParadaListPage.tsx` (table: nombre, latitud, longitud, estado; search, filter by estado; edit/delete buttons)
- [ ] 8.4 Create `apps/admin-web/src/features/infrastructure/pages/ParadaDetailPage.tsx` (show details, edit form in modal, delete confirm)
- [ ] 8.5 Write tests for ParadaForm (validation feedback, submit success/error handling)
- [ ] 8.6 Write tests for ParadaListPage (render list, filter, pagination)

---

## Phase 9: Frontend Estación Module

- [ ] 9.1–9.6 Repeat 8.1–8.6 for Estación: hook, form, list page, detail page, tests (includes parada FK selector in form)

---

## Phase 10: Frontend Parqueo Module

- [ ] 10.1–10.6 Repeat 8.1–8.6 for Parqueo: hook, form, list page, detail page, tests (includes estación FK selector, capacity input)

---

## Phase 11: Frontend Línea Module (Complex)

- [ ] 11.1 Create `apps/admin-web/src/features/infrastructure/hooks/useLineas.ts` (fetch, create, update, + parada management via junction endpoints)
- [ ] 11.2 Create `apps/admin-web/src/features/infrastructure/components/LineaForm.tsx` (numero_linea, nombre, color picker for color_hex, tipo_recorrido radio, parqueo FK selector, estado)
- [ ] 11.3 Create `apps/admin-web/src/features/infrastructure/components/LineaParadaTable.tsx` (readonly after line creation; shows parada sequence with orden, minutos; edit/add/remove buttons)
- [ ] 11.4 Create `apps/admin-web/src/features/infrastructure/pages/LineaListPage.tsx` (table: numero_linea, nombre, estado, parada count; filter by estado)
- [ ] 11.5 Create `apps/admin-web/src/features/infrastructure/pages/LineaDetailPage.tsx` (show line + paradas; allow edit parada order/timing, add parada, remove parada)
- [ ] 11.6 Write tests for LineaForm (color validation, FK validation)
- [ ] 11.7 Write tests for LineaParadaTable (add/remove logic, ≥2 check on frontend warning)
- [ ] 11.8 Write tests for LineaDetailPage (parada management flow)

---

## Phase 12: Frontend Afectación Module

- [ ] 12.1 Create `apps/admin-web/src/features/infrastructure/hooks/useAfectaciones.ts` (fetch, create, update, + close method)
- [ ] 12.2 Create `apps/admin-web/src/features/infrastructure/components/AfectacionForm.tsx` (tipo, motivo textarea, fecha_inicio datetime, fecha_fin (optional), estado; XOR location: radio to pick "Parada" or "Estación" + FK selector)
- [ ] 12.3 Create `apps/admin-web/src/features/infrastructure/pages/AfectacionListPage.tsx` (table: tipo, motivo preview, location (parada/estación name), estado, close button)
- [ ] 12.4 Create `apps/admin-web/src/features/infrastructure/pages/AfectacionDetailPage.tsx` (show details, close button, allow motivo edit)
- [ ] 12.5 Write tests for AfectacionForm (XOR validation, date validation)
- [ ] 12.6 Write tests for AfectacionListPage (render, close action)

---

## Phase 13: Integration & Permission Gating

- [ ] 13.1 Update `apps/admin-web/src/features/authentication/landing-page.tsx`: Add `onClick` handler to infrastructure card (currently inert `<div>`) that navigates to `/infrastructure` if user has `INFRAESTRUCTURA_GESTIONAR` permission
- [ ] 13.2 Write integration test: landing page + infrastructure module; verify card is clickable for permitted user, hidden for unpermitted user
- [ ] 13.3 Add E2E test: full CRUD flow for one entity (Parada): login → navigate → list → create → edit → delete → confirm removed
- [ ] 13.4 Verify Swagger docs auto-generated and accessible at `/swagger`
- [ ] 13.5 Run backend & frontend test suites; confirm coverage targets met (services ≥80%, controllers ≥70%, frontend components ≥70%)

---

## Phase 14: Design Decision Resolution & Documentation

- [ ] 14.1 **DECISION REQUIRED**: Confirm route prefix choice (Decision #6 from design.md): is `/infrastructure/paradas` correct or should it be `/api/infrastructure/paradas`? (affects spec.md compliance)
- [ ] 14.2 **DECISION REQUIRED**: Confirm soft-delete value for Parada (Decision #7): use existing DB `CHECK` constraint value `'CERRADA'` or add migration to include `'INACTIVA'`? (current design uses `CERRADA` per DB schema)
- [ ] 14.3 Document deletion semantics in README: Parada soft-deletes to `CERRADA`; Estación/Parqueo/Afectación behavior (soft vs hard; current design: hard delete after FK guard)
- [ ] 14.4 Add inline comments to `infrastructure.module.ts` explaining module boundary rationale and FK validation strategy
- [ ] 14.5 Create `apps/api/src/infrastructure/README.md` documenting DTOs, error codes, pagination, and permission requirement
- [ ] 14.6 Create `apps/admin-web/src/features/infrastructure/README.md` documenting component structure, hook usage, and form validation patterns

---

## Implementation Notes

### Critical Path Dependencies
1. **Phase 1** (Setup) must complete first — all other phases depend on module registration and validation infrastructure
2. **Phase 2–6** (Backend entities) can run in parallel after Phase 1; each entity is independent
3. **Phase 7** (Frontend setup) can run parallel to backend but must complete before Phase 8–12
4. **Phase 8–12** (Frontend entities) can run in parallel after Phase 7
5. **Phase 13** (Integration) must run after backend + frontend complete
6. **Phase 14** (Decisions) should be resolved **before** Phase 1 starts to avoid rework

### Risk Mitigation
- **Complex FK relationships**: Phase 2 setup includes FK validation helpers; each entity service tests FK constraints in isolation
- **Línea junction complexity** (Phase 11): start with read-only table display in PR 3 (frontend), then add edit in a follow-up if scope grows
- **Permission edge cases**: Phase 13.1–13.2 explicitly tests permission flows; don't merge landing-page changes until verified
- **DB schema conflict** (Decision #7): confirm before Phase 2.6; if migration needed, add to Phase 1

### Testing Strategy
- **Unit tests** (Phases 2–6, 8–12): mock repositories, test validation + error paths
- **Integration tests** (Phase 13.3–13.5): real Postgres test DB, transaction rollback
- **E2E tests** (Phase 13.3): full login → CRUD flow against real server
- **Frontend component tests**: Vitest + Testing Library; mock API calls with msw or jest mocks

---

## Estimated Effort by Phase

| Phase | Tasks | Estimated Hours | Notes |
|-------|-------|-----------------|-------|
| 1 | 8 | 3–4 | Setup, one-time |
| 2–6 | 50 | 20–25 | Backend CRUD ×5 entities; can parallelize |
| 7 | 6 | 2–3 | Frontend structure, routes |
| 8–12 | 30 | 15–18 | Frontend pages ×5 entities; can parallelize |
| 13 | 5 | 4–5 | Integration, E2E, docs verification |
| 14 | 6 | 2–3 | Decision confirmation, README |
| **Total** | **105** | **46–58 hours** | ~2–3 weeks @ 2 days/week |

---
