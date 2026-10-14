import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { AlertaController } from "./alerts/alerta.controller.js";
import { AlertaService } from "./alerts/alerta.service.js";

// Operation module (database/init.sql "Operación"): v1 covers unit -> station
// alerts only. No forFeature: AlertaService uses the shared DataSource.
@Module({
  imports: [AuthenticationModule],
  controllers: [AlertaController],
  providers: [AlertaService],
})
export class OperationsModule {}
