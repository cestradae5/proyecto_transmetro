import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { CitizenModule } from "../citizen/citizen.module.js";
import { CardsController } from "./cards.controller.js";
import { CardsService } from "./cards.service.js";

// Staff card activity (odd/tasks/card-activity.md). No forFeature: the
// service uses the shared DataSource. CitizenModule provides the QPayPro
// reconciliation behind the verify route (qpaypro-checkout S7).
@Module({
  imports: [AuthenticationModule, CitizenModule],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
