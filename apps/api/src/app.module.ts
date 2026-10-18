import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./platform/database/database.module.js";
import { AuthenticationModule } from "./authentication/authentication.module.js";
import { InfrastructureModule } from "./infrastructure/infrastructure.module.js";
import { FleetModule } from "./fleet/fleet.module.js";
import { PersonalModule } from "./personal/personal.module.js";
import { ProfileModule } from "./profile/profile.module.js";
import { AuditLogModule } from "./audit-log/audit-log.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { OperationsModule } from "./operations/operations.module.js";
import { CitizenModule } from "./citizen/citizen.module.js";
import { CardsModule } from "./cards/cards.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    AuthenticationModule,
    InfrastructureModule,
    FleetModule,
    PersonalModule,
    ProfileModule,
    AuditLogModule,
    ReportsModule,
    OperationsModule,
    CitizenModule,
    CardsModule,
    ...(process.env.NODE_ENV === "test" ? [] : [DatabaseModule]),
  ],
})
export class AppModule {}
