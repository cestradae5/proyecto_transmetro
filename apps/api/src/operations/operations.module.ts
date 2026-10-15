import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { AlertaController } from "./alerts/alerta.controller.js";
import { AlertaService } from "./alerts/alerta.service.js";
import { RidershipController, TurnstileController } from "./ridership/ridership.controller.js";
import { RidershipService } from "./ridership/ridership.service.js";
import { TurnstileKeyGuard } from "./ridership/turnstile-key.guard.js";

// Operation module (database/init.sql "Operación"): unit -> station alerts
// and passenger counting (ridership). No forFeature: the services use the
// shared DataSource.
@Module({
  imports: [AuthenticationModule],
  controllers: [AlertaController, TurnstileController, RidershipController],
  providers: [AlertaService, RidershipService, TurnstileKeyGuard],
})
export class OperationsModule {}
