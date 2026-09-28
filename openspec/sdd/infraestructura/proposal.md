# Proposal: Infrastructure Module (Gestión de Infraestructura)

## Intent

The infrastructure module provides **operational visibility and control** over Transmetro's physical transit network. Currently, database tables exist for Paradas (stops), Estaciones (stations), Parqueos (parking), Líneas (lines), and Afectaciones (disruptions), but **no REST API or dashboard interface exists** to manage them. This change implements a complete backend API + frontend dashboard to enable OPERADOR_CENTRAL and ADMINISTRADOR_SISTEMA users to create, read, update, and delete infrastructure entities—unblocking fleet assignment, operational alerts, and incident response workflows.

## Scope

### In Scope
- **Backend REST API** (`apps/api/src/infrastructure/`) for 5 core entities (Paradas, Estaciones, Parqueos, Líneas, Afectaciones)
- **Frontend CRUD pages** (React feature module in `apps/admin-web/src/features/infrastructure/`)
- **Database integration** via TypeORM with existing schema (`tbl_parada`, `tbl_estacion`, `tbl_parqueo`, `tbl_linea`, `tbl_afectacion`)
- **Permission gating** (`INFRAESTRUCTURA_GESTIONAR`) on all endpoints and UI actions
- **Relationship validation** (FK constraints: lines → stops, stations → lines, disruptions → locations)
- **List/detail/form pages** with search, filter, and inline edit capabilities
- **API documentation** (NestJS controllers, Swagger integration)

### Out of Scope
- **Map visualization** (GIS rendering, geospatial queries) — future enhancement
- **Bulk import/export** (CSV/Excel) — defer to roadmap
- **Mobile app** (only admin web dashboard)
- **Real-time sync** (REST polling only; WebSockets deferred)
- **Line stop sequencing UI** (form builder for stop ordering) — simplified inline ordering only
- **Capacity forecasting / analytics** — operational layer only

## Capabilities

### New Capabilities
- `parada-crud`: Create, read, update, delete transit stops with GPS coordinates and state management
- `estacion-crud`: Manage transit stations (hubs) with capacity tracking and line assignments
- `parqueo-crud`: Handle parking lot inventory with capacity, type, and location
- `linea-crud`: Define and manage transit lines with route types, stop sequences, and parking assignments
- `afectacion-management`: Create and close operational disruptions (maintenance windows, incidents)

### Modified Capabilities
- None — this is greenfield infrastructure logic (no spec-level requirements currently exist for these entities)

## Approach

### Backend (NestJS Module)

**Structure:**
```
apps/api/src/infrastructure/
├── infrastructure.module.ts
├── infrastructure.controller.ts
├── infrastructure.service.ts
├── entities/
│   ├── parada.entity.ts
│   ├── estacion.entity.ts
│   ├── parqueo.entity.ts
│   ├── linea.entity.ts
│   └── afectacion.entity.ts
├── dto/
│   ├── create-parada.dto.ts
│   ├── update-parada.dto.ts
│   └── ... (similar for all entities)
└── __tests__/
    ├── infrastructure.service.spec.ts
    ├── infrastructure.controller.spec.ts
    └── infrastructure.integration.spec.ts
```

**Responsibilities:**
- Map TypeORM entities to existing database schema
- Implement CRUD service methods with validation (FK relationships, state transitions)
- Expose REST endpoints (`/api/infrastructure/paradas`, `/api/infrastructure/estaciones`, etc.)
- Guard endpoints with `@RequirePermission('INFRAESTRUCTURA_GESTIONAR')`
- Enforce business rules: parada must belong to valid línea, estación must reference valid parqueo, etc.

### Frontend (React Feature Module)

**Structure:**
```
apps/admin-web/src/features/infrastructure/
├── index.ts
├── pages/
│   ├── InfrastructureDashboard.tsx
│   ├── ParadaListPage.tsx
│   ├── ParadaDetailPage.tsx
│   ├── EstacionListPage.tsx
│   ├── EstacionDetailPage.tsx
│   ├── ParqueoListPage.tsx
│   ├── ParqueoDetailPage.tsx
│   ├── LineaListPage.tsx
│   ├── LineaDetailPage.tsx
│   ├── AfectacionListPage.tsx
│   └── AfectacionDetailPage.tsx
├── components/
│   ├── ParadaForm.tsx
│   ├── EstacionForm.tsx
│   ├── ParqueoForm.tsx
│   ├── LineaForm.tsx
│   └── AfectacionForm.tsx
├── hooks/
│   ├── useParadas.ts
│   ├── useEstaciones.ts
│   ├── useParqueos.ts
│   ├── useLineas.ts
│   └── useAfectaciones.ts
├── __tests__/
│   ├── ParadaListPage.spec.tsx
│   └── ...
└── routes.tsx
```

**User Flows:**
- **Parada Management**: List → Create/Edit → Save → Confirm
- **Estación Management**: Assign to parking, track capacity
- **Línea Management**: Define route, sequence stops with order/travel-time
- **Afectación Management**: Quick-create disruption, close when resolved

### Integration Points
- **Authentication**: Verify `INFRAESTRUCTURA_GESTIONAR` permission on page load and form submission
- **Database Module**: Use existing TypeORM configuration (`DatabaseModule`)
- **Landing Page**: Navigate to infrastructure dashboard when user has permission
- **Future**: Fleet module will reference lines; operational alerts will reference disruptions

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/infrastructure/` | **New** | Backend REST API module with 5 entity controllers and service layer |
| `apps/api/src/app.module.ts` | **Modified** | Register `InfrastructureModule` in imports |
| `apps/admin-web/src/features/infrastructure/` | **New** | React feature module with list/detail/form pages for all 5 entities |
| `apps/admin-web/src/features/authentication/landing-page.tsx` | **Modified** | Navigation link now routes to `/infrastructure` dashboard (not just placeholder) |
| `database/init.sql` | **No change** | Schema already exists; no DDL changes required |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Complex FK relationships** (lines → paradas, estaciones → parqueos) enforced only in service layer | Medium | Document validation rules in service; add integration tests for constraint violations |
| **Permission mapping unclear** (INFRAESTRUCTURA_GESTIONAR grants what exactly?) | Medium | Spec phase must clarify: Can OPERADOR_CENTRAL create lines? Just read? Only disruptions? |
| **No existing NestJS entity/service patterns in codebase** | Medium | Follow authentication module pattern; code review enforces consistency |
| **Frontend routing/navigation conflicts** (infrastructure dashboard not yet hooked to landing page) | Low | Test landing page navigation before go-live |
| **Stop sequencing complexity** (línea_parada order + travel_time) | Medium | MVP: simple form-based ordering; defer drag-drop UI to future |
| **Concurrent edit conflicts** (two users edit same parada simultaneously) | Low | Use optimistic locking (version column) or last-write-wins; document in spec |

## Rollback Plan

1. **Code removal**: Delete `apps/api/src/infrastructure/` folder; remove import from `app.module.ts`
2. **Frontend removal**: Delete `apps/admin-web/src/features/infrastructure/` folder; remove route from navigation
3. **Database**: No DDL rollback needed (schema unchanged; data persists)
4. **Landing page**: Revert navigation link to "Infrastructure" → placeholder or hidden state
5. **Verify**: Auth service still maps `INFRAESTRUCTURA_GESTIONAR` permission (no harm if module unused)
6. **Time to rollback**: < 15 minutes (no data migration required)

## Dependencies

- **Existing Database Schema**: `tbl_parada`, `tbl_estacion`, `tbl_parqueo`, `tbl_linea`, `tbl_afectacion` tables and relationships already defined
- **Authentication/Authorization**: `INFRAESTRUCTURA_GESTIONAR` permission exists and is mapped to OPERADOR_CENTRAL and ADMINISTRADOR_SISTEMA roles
- **TypeORM & DatabaseModule**: Existing configuration; infrastructure module uses standard patterns
- **React routing**: Admin web feature module structure already established (authentication feature used as reference)
- **Admin web landing page**: Expects infrastructure module to exist and render at `/infrastructure`

## Success Criteria

- [ ] Backend API: All 5 CRUD endpoints (`/api/infrastructure/{entity}`) respond with correct HTTP status codes
- [ ] Frontend: User can navigate from landing page → Infrastructure dashboard → select entity type → create/edit/delete
- [ ] Permission gating: Unauthenticated or unpermissioned user receives 401/403; with permission, CRUD succeeds
- [ ] Relationship validation: Creating a line without valid paradas fails; creating parada with invalid foreign keys fails
- [ ] Database consistency: No orphaned records (e.g., parada without línea reference when required)
- [ ] Test coverage: Service layer ≥ 80%, controller endpoints tested for permission/validation
- [ ] Documentation: Swagger docs generated for all endpoints; frontend component folder has README with usage examples

---

**Status**: Ready for Spec Phase  
**Estimated Effort**: 8–12 days (backend 4–5 days, frontend 3–4 days, integration/testing 2–3 days)  
**Next Artifact**: `openspec/sdd/infraestructura/spec.md`
