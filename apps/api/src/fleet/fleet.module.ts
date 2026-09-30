import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { InfrastructureModule } from "../infrastructure/infrastructure.module.js";
import { PilotEligibilityLookup } from "./shared/pilot-eligibility.lookup.js";

// Skeleton de FleetModule (Slice 1 — design.md, "Approach" y task 1.2.7).
//
// Deviation from the task's literal wording: task 1.2.7 lists `controllers`
// and `providers` for UnidadController/AsignacionUnidadController/
// AsignacionPilotoController and their services, plus a
// `TypeOrmModule.forFeature([UnidadEntity, AsignacionUnidadEntity,
// AsignacionPilotoEntity, EmployeeEntity])` import — none of those entities,
// services, or controllers exist yet; they are created in Slices 2-4. This
// skeleton only wires what Slice 1 actually delivers (AuthenticationModule
// for AuditRepository DI, InfrastructureModule for the Slice 2 derived
// `parqueo` composition, and PilotEligibilityLookup), so this PR compiles
// and tests green on its own, per the feature-branch-chain requirement that
// "every PR must compile on its own target". Controllers, fleet entities,
// and their TypeOrmModule.forFeature registration are added incrementally
// in Slices 2-4 as each entity/service/controller is created — matching
// Decision 9's required registration order (AsignacionPilotoController
// before UnidadController) once those controllers exist.
@Module({
  imports: [AuthenticationModule, InfrastructureModule],
  providers: [PilotEligibilityLookup],
})
export class FleetModule {}
