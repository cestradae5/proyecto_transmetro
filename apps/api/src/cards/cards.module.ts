import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { CardsController } from "./cards.controller.js";
import { CardsService } from "./cards.service.js";

// Staff card activity (odd/tasks/card-activity.md). No forFeature: the
// service uses the shared DataSource.
@Module({
  imports: [AuthenticationModule],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
