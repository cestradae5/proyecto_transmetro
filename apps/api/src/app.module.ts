import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { HealthModule } from "./health/health.module.js";
import { DatabaseModule } from "./platform/database/database.module.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: join(currentDirectory, "..", "..", "..", ".env"),
      isGlobal: true,
    }),
    HealthModule,
    ...(process.env.NODE_ENV === "test" ? [] : [DatabaseModule]),
  ],
})
export class AppModule {}
