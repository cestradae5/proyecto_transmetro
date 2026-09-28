## Exploration: Infraestructura Module for Transmetro

### Current State

The Transmetro project has **two distinct infrastructure concepts** that need clear separation:

1. **Platform Infrastructure** (CONCERNS) — Currently in `apps/api/src/platform/`:
   - Database connections and TypeORM configuration
   - Environment variable management (`readDatabaseEnvironment`, `readAuthenticationEnvironment`)
   - Authentication infrastructure (JWT, Google OAuth)
   - These are technical concerns, not domain logic

2. **Transmetro Infrastructure Domain** (NOT YET IMPLEMENTED AS A MODULE):
   - Physical transit network: Paradas (stops), Estaciones (stations), Parqueos (parking), Líneas (lines)
   - Database tables exist in `database/init.sql` (lines 179–241)
   - Permission exists: `INFRAESTRUCTURA_GESTIONAR`
   - UI label exists: MODULE_LABELS["infrastructure"] = "Gestión de paradas, estaciones y parqueos"
   - **NO corresponding REST API, service, or entity layer exists yet**

### Affected Areas

- `database/init.sql` (lines 178–241) — Infrastructure domain schema:
  - `tbl_parada` — Transit stops with GPS coordinates and state
  - `tbl_estacion` — Stations (hubs) with capacity, linked to parking
  - `tbl_parqueo` — Parking lots with capacity, type, location
  - `tbl_linea` — Transit lines with route type, parking assignment
  - `tbl_linea_parada` — Line-to-stop routing with order and travel time
  - `tbl_estacion_linea` — Station role in line (principal/control/support)
  - `tbl_afectacion` — Operational disruptions/maintenance windows
  - `tbl_asignacion_estacion` — Station staff assignments

- `apps/api/src/platform/` — Contains TECHNICAL infrastructure (config, DB, auth). This folder should stay focused on platform concerns; it should NOT absorb domain logic.

- `apps/admin-web/src/features/authentication/landing-page.tsx:9` — Defines MODULE_LABELS["infrastructure"] and expects the module to expose stops/stations/parking management. The landing page will navigate to this module when a user has the `infrastructure` module assigned.

- `apps/api/src/authentication/authentication.service.ts:25` — PERMISSION_TO_MODULE mapping links `INFRAESTRUCTURA_GESTIONAR` permission to the "infrastructure" module scope.

- `apps/api/src/app.module.ts` — Currently imports:
  - HealthModule
  - DatabaseModule (platform concern)
  - AuthenticationModule
  - **NOT importing an infrastructure module yet**

### Approaches

| Approach | Pros | Cons | Effort |
|----------|------|------|--------|
| **1. Create `apps/api/src/infrastructure/` domain module** | ✓ Clear separation: domain logic isolated from platform concerns<br>✓ Follows NestJS best practice: one module per domain<br>✓ Maps directly to UI expectations (landing page shows "infrastructure" as a discrete module)<br>✓ Easy to test independently<br>✓ Allows future multi-tenant isolation | ✗ None significant | Low |
| **2. Add infrastructure tables to `platform/database/`** | ✓ Minimal folder restructuring | ✗ **WRONG**: Conflates domain logic with platform infrastructure concerns<br>✗ Breaks architectural clarity (database config ≠ transit domain)<br>✗ Makes testing harder; platform concerns mix with business logic<br>✗ Violates separation of concerns | Low but wrong |
| **3. Create infrastructure under `apps/api/src/features/`** | ✓ Matches admin-web folder structure (symmetry) | ✗ "Features" is ambiguous; features are UI components, not domain boundaries | Low but ambiguous |

### Recommendation

**Approach 1: Create `apps/api/src/infrastructure/` domain module** (RECOMMENDED)

The infrastructure module should:

1. **Structure** (new folder):
   ```
   apps/api/src/infrastructure/
   ├── infrastructure.module.ts              — NestJS module definition
   ├── infrastructure.controller.ts          — REST endpoints for CRUD
   ├── infrastructure.service.ts             — Business logic & orchestration
   ├── entities/
   │   ├── parada.entity.ts
   │   ├── estacion.entity.ts
   │   ├── parqueo.entity.ts
   │   ├── linea.entity.ts
   │   └── afectacion.entity.ts
   ├── dto/
   │   ├── create-parada.dto.ts
   │   ├── update-parada.dto.ts
   │   └── ...
   └── spec/
       ├── infrastructure.service.spec.ts
       ├── infrastructure.controller.spec.ts
       └── infrastructure.integration-spec.ts
   ```

2. **Responsibilities**:
   - **Parada (Stop)**: CRUD, GPS query, state management, list by line
   - **Estación (Station)**: CRUD, assignment to parking, list by line, capacity checks
   - **Parqueo (Parking)**: CRUD, capacity tracking, type filtering, location queries
   - **Línea (Line)**: CRUD, route definition, stop sequencing, parking assignment
   - **Afectación (Disruption)**: Create/close disruptions, impact reporting, alert coordination

3. **REST Endpoints** (permission-gated by `INFRAESTRUCTURA_GESTIONAR`):
   - `GET /infrastructure/stops` — List all paradas
   - `POST /infrastructure/stops` — Create parada
   - `GET /infrastructure/stops/:id` — Get parada details
   - `PATCH /infrastructure/stops/:id` — Update parada
   - `DELETE /infrastructure/stops/:id` — Deactivate/remove parada
   - Similar CRUD for stations, parking, lines
   - `POST /infrastructure/disruptions` — Create afectación
   - `GET /infrastructure/disruptions` — List active disruptions

4. **Integration Points**:
   - **Authentication**: Guard endpoints with `@RequirePermission('INFRAESTRUCTURA_GESTIONAR')`
   - **Platform DB**: Use existing `DatabaseModule` for TypeORM configuration
   - **Fleet Module** (future): Lines belong to infrastructure; fleet assignments reference them
   - **Operational Alerts Module** (future): Disruptions tie to infrastructure locations

5. **Testing**:
   - Unit tests for service logic (state transitions, queries)
   - Integration tests for endpoints (permission checks, database consistency)
   - Spec tests for data consistency (e.g., line must reference valid paradas)

### Risks

- **Scope Creep**: The infrastructure domain touches fleet, operations, and alerts. Boundaries must be clear. Infrastructure OWNS stops/stations/parking/lines; operations USES them to manage alerts and assignments.
- **Existing Permission Mapping**: The permission `INFRAESTRUCTURA_GESTIONAR` exists and is tied to the OPERADOR_CENTRAL and ADMINISTRADOR_SISTEMA roles. Any module implementation must honor this RBAC mapping, and the spec should document what this permission grants access to.
- **Database Constraints**: The existing schema has complex relationships (line → parking, station → line, afectación → stop/station). The module must enforce these FK and state constraints in the service layer, not just at the DB.
- **Future Multi-Tenancy**: If Transmetro expands to multiple cities/operators, infrastructure data will need scope isolation. The module design should allow for that (e.g., tentative `id_operador` column for future expansion, though not blocking this SDD).

### Ready for Proposal

**Yes.**

The infrastructure module is well-bounded, database-backed, permission-gated, and ready to move to the **Propose** phase. The next step should:

1. Write an SDD proposal defining the module's intent, scope, and acceptance criteria
2. Specify which infrastructure operations the OPERADOR_CENTRAL can perform (CRUD? Disruption management only?)
3. Document the relationship between infrastructure, fleet, and operational alerts
4. Confirm whether infrastructure assignments (paradas to líneas, estaciones to líneas) are bidirectional or 1-way
