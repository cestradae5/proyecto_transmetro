import { Module } from "@nestjs/common";

import { CitizenController } from "./citizen.controller.js";
import { CitizenService } from "./citizen.service.js";
import { RechargeSimulatorGuard } from "./recharge-simulator.guard.js";

// Public citizen endpoints (apps/user-web). No forFeature: the service uses
// the shared DataSource.
@Module({
  controllers: [CitizenController],
  providers: [CitizenService, RechargeSimulatorGuard],
})
export class CitizenModule {}
