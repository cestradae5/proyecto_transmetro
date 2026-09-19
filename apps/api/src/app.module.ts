import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./platform/database/database.module.js";
import { AuthenticationModule } from "./authentication/authentication.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HealthModule,
    AuthenticationModule,
    ...(process.env.NODE_ENV === "test" ? [] : [DatabaseModule]),
  ],
})
export class AppModule {}
