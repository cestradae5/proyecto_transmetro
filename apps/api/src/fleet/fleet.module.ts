import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { InfrastructureModule } from "../infrastructure/infrastructure.module.js";
import { AsignacionEstacionController } from "./asignacion-estacion/asignacion-estacion.controller.js";
import { AsignacionEstacionService } from "./asignacion-estacion/asignacion-estacion.service.js";
import { OperadorEstacionController } from "./operador-estacion/operador-estacion.controller.js";
import { OperadorEstacionService } from "./operador-estacion/operador-estacion.service.js";
import { AsignacionPilotoController } from "./asignacion-piloto/asignacion-piloto.controller.js";
import { AsignacionPilotoService } from "./asignacion-piloto/asignacion-piloto.service.js";
import { AsignacionUnidadController } from "./asignacion-unidad/asignacion-unidad.controller.js";
import { AsignacionUnidadService } from "./asignacion-unidad/asignacion-unidad.service.js";
import { PilotoController } from "./piloto/piloto.controller.js";
import { PilotoService } from "./piloto/piloto.service.js";
import { PilotEligibilityLookup } from "./shared/pilot-eligibility.lookup.js";
import { UnidadController } from "./unidad/unidad.controller.js";
import { UnidadService } from "./unidad/unidad.service.js";

// FleetModule (Slice 1 skeleton, design.md "Approach" + task 1.2.7;
// extended in Slice 2 with Unidad CRUD, Slice 3 with line-assignment and
// location reporting, Slice 4 with pilot assignment and pilot self-service
// endpoints).
//
// No `TypeOrmModule.forFeature([UnidadEntity, AsignacionUnidadEntity, ...])`
// here: none of UnidadService/AsignacionUnidadService/AsignacionPilotoService
// use `@InjectRepository`. Writes go through `manager.getRepository(X)`
// inside `dataSource.transaction()`, and the services' non-transactional
// reads go through `this.dataSource.getRepository(X)` directly — the same
// stateless pattern as `SessionRepository`/`EmployeeRepository`/
// `PilotEligibilityLookup`. `typeorm.options.ts` sets `autoLoadEntities:
// true` and globs every `*.entity.{js,ts}` file, so every fleet entity is
// already registered on the single DataSource without a `forFeature` call
// (see apply-progress Slice 1, Deviation #2 — the same reasoning applies
// here).
//
// Decision 9 (design.md): `AsignacionPilotoController` owns the static
// route `GET /fleet/units/my-unit`, which MUST be listed in `controllers`
// BEFORE `UnidadController` — otherwise `UnidadController`'s dynamic
// `GET /fleet/units/:id` would shadow it and "my-unit" would be parsed as a
// unit id. Verified by the route-collision e2e test in
// asignacion-piloto.e2e-spec.ts. `AsignacionUnidadController` has no such
// collision (its routes end in a literal segment like
// "line-assignment"/"location") but is listed before `UnidadController`
// too, for symmetry with the design's own ordering.
@Module({
  imports: [AuthenticationModule, InfrastructureModule],
  controllers: [
    AsignacionEstacionController,
    OperadorEstacionController,
    AsignacionPilotoController,
    AsignacionUnidadController,
    PilotoController,
    UnidadController,
  ],
  providers: [
    PilotEligibilityLookup,
    AsignacionEstacionService,
    OperadorEstacionService,
    PilotoService,
    UnidadService,
    AsignacionUnidadService,
    AsignacionPilotoService,
  ],
})
export class FleetModule {}
