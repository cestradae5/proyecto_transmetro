import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./platform/database/database.module.js";
import { AuthenticationModule } from "./authentication/authentication.module.js";
import { InfrastructureModule } from "./infrastructure/infrastructure.module.js";
import { FleetModule } from "./fleet/fleet.module.js";
import { PersonalModule } from "./personal/personal.module.js";

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
    ...(process.env.NODE_ENV === "test" ? [] : [DatabaseModule]),
  ],
})
export class AppModule {}
