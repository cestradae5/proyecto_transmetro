import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { createTypeOrmModuleOptions } from "./typeorm.options.js";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: createTypeOrmModuleOptions,
    }),
  ],
})
export class DatabaseModule {}
