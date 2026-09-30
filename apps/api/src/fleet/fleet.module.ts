import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { InfrastructureModule } from "../infrastructure/infrastructure.module.js";
import { PilotEligibilityLookup } from "./shared/pilot-eligibility.lookup.js";
import { UnidadController } from "./unidad/unidad.controller.js";
import { UnidadService } from "./unidad/unidad.service.js";

// FleetModule (Slice 1 skeleton, design.md "Approach" + task 1.2.7;
// extended in Slice 2 with Unidad CRUD).
//
// No `TypeOrmModule.forFeature([UnidadEntity, ...])` here: UnidadService
// never uses `@InjectRepository`. Writes go through
// `manager.getRepository(UnidadEntity)` inside `dataSource.transaction()`,
// and the two non-transactional reads (findOne/findAll) go through
// `this.dataSource.getRepository(UnidadEntity)` directly — the same
// stateless pattern as `SessionRepository`/`EmployeeRepository`/
// `PilotEligibilityLookup`. `typeorm.options.ts` sets `autoLoadEntities:
// true` and globs every `*.entity.{js,ts}` file, so `UnidadEntity` is
// already registered on the single DataSource without a `forFeature` call
// (see apply-progress Slice 1, Deviation #2 — the same reasoning applies
// here).
//
// Decision 9 (design.md): once Slice 4 adds `AsignacionPilotoController`
// (which owns the static route `GET /fleet/units/my-unit`), it MUST be
// listed in `controllers` BEFORE `UnidadController` — otherwise
// `UnidadController`'s dynamic `GET /fleet/units/:id` would shadow it and
// "my-unit" would be parsed as a unit id. `AsignacionUnidadController`
// (Slice 3) has no such collision (its routes end in a literal segment
// like "line-assignment"/"location") but is listed first too, for symmetry
// with the design's own ordering.
@Module({
  imports: [AuthenticationModule, InfrastructureModule],
  controllers: [UnidadController],
  providers: [PilotEligibilityLookup, UnidadService],
})
export class FleetModule {}
