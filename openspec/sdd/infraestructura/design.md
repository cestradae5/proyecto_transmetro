# Design: Infrastructure Module (Backend + Frontend)

## Technical Approach

One `InfrastructureModule` (NestJS) with **5 entity-scoped controller/service pairs** sharing common
DTOs, an exception filter, and FK-validation helpers. Frontend mirrors this with a `features/infrastructure/`
React module using plain `fetch` (matching `auth-context.tsx`), no new state library. Both sides enforce
the ambiguity-resolution decisions: last-write-wins (no versioning), form-based `orden` input for
`tbl_linea_parada`, full CRUD for any `INFRAESTRUCTURA_GESTIONAR` holder.

## Architecture Decisions

| # | Decision | Choice | Alternative | Rationale |
|---|----------|--------|-------------|-----------|
| 1 | Module boundary | 1 `InfrastructureModule`, 5 controllers + 5 services (Parada/Estacion/Parqueo/Linea/Afectacion) | 5 separate NestJS modules | Cross-entity FK checks (Linea→Parqueo, Estacion→Parada) need sibling repos in the same DI scope; separate modules would force circular `imports`/`exports`. |
| 2 | Repository access | `@InjectRepository(Entity)` per service | Manual `EntityManager` passing (auth's `EmployeeRepository` pattern) | Auth's manual-manager + pessimistic lock exists for login race conditions. Decision #1 (ambiguity-resolution) rules out locking here — standard injected repos are simpler and sufficient. |
| 3 | Validation | Add `class-validator` + `class-transformer` + global `ValidationPipe` (**new deps**) | Manual per-field checks (current `AuthenticationController` style) | ~25 endpoints × structural DTOs would multiply manual checks 8×. Auth's 3-endpoint controller doesn't need this; 5-entity CRUD does. |
| 4 | Business/FK rules | Enforced in service layer, DB `CHECK`/`FK` as backstop only | DB-constraint-only | DB can't return `PARADA_NOT_FOUND`/`XOR_VIOLATION` JSON codes the spec requires; matches `explore.md` recommendation. |
| 5 | Error mapping | One `DomainExceptionFilter` (`@Catch(DomainError)`) mapping typed errors → HTTP + code | Per-method try/catch (current auth pattern) | Keeps the established typed-error convention (`authentication.contracts.ts`) but scales it past 25 handlers without duplicating catch blocks. |
| 6 | Route prefix | `/infrastructure/{entity}` (no `/api` prefix) | `/api/infrastructure/...` as written in spec.md | No `app.setGlobalPrefix` exists; `/authentication` and `/health` have none. Adding one now is a breaking change to those routes. **Flagged as open question — confirm before apply.** |
| 7 | Parada soft-delete value | `estado_parada = 'CERRADA'` | `'INACTIVA'` (spec.md wording) | DB `CHECK (estado_parada IN ('ACTIVA','CERRADA','MANTENIMIENTO'))` rejects `'INACTIVA'`. **Spec/DB conflict — flagged, needs author confirmation.** |
| 8 | Frontend forms | Controlled components + local `useState`, manual validators mirroring DTO rules | `react-hook-form` + `zod` (**new deps**) | Neither installed; no existing form to justify the addition for 5 straightforward entities in MVP. |
| 9 | Frontend data access | Per-entity hooks wrapping `fetch` + `API_BASE_URL` + Bearer token | React Query/SWR (**new deps**) | Matches `auth-context.tsx` exactly; avoids introducing caching semantics for simple admin CRUD. |
| 10 | API docs | Add `@nestjs/swagger` (**new dep**), reuse validation DTOs via `@ApiProperty` | Skip Swagger | Proposal lists it in-scope; incremental cost is low once DTOs exist for validation. |

## Data Flow

    Create Parada:
    ParadaForm ──POST /infrastructure/paradas──► ParadaController ──► ParadaService
                                                                          │ (uniqueness + coord checks)
                                                                          ▼
                                                                    ParadaRepository.save()
                                                                          │
    ParadaListPage ◄──200 ParadaResponseDto────────────────────────────┘

    Update Linea + paradas (junction tbl_linea_parada):
    LineaForm ──PATCH /infrastructure/lineas/{id}/paradas──► LineaController ──► LineaService
      checks: unique `orden` per línea, ≥2 paradas remain ──► LineaParadaRepository (transaction)

    Delete with FK guard (Parqueo example):
    ParqueoController ──DELETE──► ParqueoService.delete()
      ├─ LineaRepository.existsBy({ parqueo }) → true → throw ParqueoInUse (409)
      └─ false → repository.delete() (hard) or estado update (soft, entity-dependent)

## File Structure

**Backend** — `apps/api/src/infrastructure/`
```
infrastructure.module.ts
entities/{parada,estacion,parqueo,linea,linea-parada,estacion-linea,afectacion}.entity.ts
{parada,estacion,parqueo,linea,afectacion}/
  {entity}.controller.ts  {entity}.service.ts  {entity}.contracts.ts (typed domain errors)
  dto/create-{entity}.dto.ts  dto/update-{entity}.dto.ts  dto/{entity}-response.dto.ts
shared/pagination.dto.ts  shared/domain-exception.filter.ts  shared/fk-validator.ts
__tests__/ (mirrors above, .spec.ts + .integration-spec.ts)
```

**Frontend** — `apps/admin-web/src/features/infrastructure/`
```
routes.tsx  index.ts
pages/{Entity}ListPage.tsx  pages/{Entity}DetailPage.tsx  pages/{Entity}FormPage.tsx  (×5 entities)
components/{Entity}Form.tsx  components/EntitySelector.tsx  components/StatusBadge.tsx
hooks/use{Entities}.ts (×5)
__tests__/
```

Modified: `app.module.ts` (register module), `main.ts` (global `ValidationPipe`), `app.tsx` (nested
`/infrastructure/*` route under existing `AuthenticationGuard`), `landing-page.tsx` (add `onClick`
navigation to the infrastructure card — **currently inert `<div>`s, no handler exists today**).

## Interfaces / Contracts

```typescript
// dto/create-parada.dto.ts
export class CreateParadaDto {
  @IsString() @Length(1, 100) nombre!: string;
  @IsNumber() @Min(-90) @Max(90) latitud!: number;
  @IsNumber() @Min(-180) @Max(180) longitud!: number;
  @IsIn(["ACTIVA", "CERRADA", "MANTENIMIENTO"]) estado!: string;
}
// contracts.ts — typed domain errors (per authentication.contracts.ts convention)
export class ParadaNameDuplicate extends Error { /* → 400 PARADA_NAME_DUPLICATE */ }
export class ParadaInUse extends Error { /* → 409 PARADA_IN_USE */ }
```

Afectación DTO enforces XOR via a custom `@ValidateIf`/class-level validator (`idParada` XOR `idEstacion`).

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Service validation (FK, XOR, ≥2 paradas, coord bounds) | Jest, mocked repositories |
| Integration | Controller + real Postgres (test DB) | `test/*.integration-spec.ts`, existing pattern |
| E2E | Permission gating (401/403), one happy path per entity | `test/*.e2e-spec.ts` |
| Frontend | Form validation, list rendering, error states | Vitest + Testing Library |

Coverage targets: services ≥80%, controllers ≥70% (per proposal success criteria).

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. This is standard CRUD behind existing JWT + permission guards.

## Migration / Rollout

No DB migration (schema unchanged). Rollout: merge backend first (tested independently via Swagger/
Postman), then frontend, then flip landing-page navigation last so the module isn't reachable until
both sides are verified.

## Open Questions

- [ ] **Route prefix**: confirm dropping `/api` from spec paths (Decision #6) — does not match spec.md literal text.
- [ ] **Parada soft-delete value**: confirm `CERRADA` vs adding `'INACTIVA'` to the DB `CHECK` constraint (Decision #7) — the latter requires a migration, contradicting "no DB changes."
- [ ] Estación/Parqueo/Afectación "delete" semantics: spec says 204 but doesn't specify soft vs hard for these three (only Parada is explicit) — design defaults to **hard delete after FK guard** for all except Parada; needs confirmation.
