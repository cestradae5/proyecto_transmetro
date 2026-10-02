import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { EmployeeEntity } from "../authentication/entities/employee.entity.js";
import { RoleEntity } from "../authentication/entities/role.entity.js";
import { PersonalController } from "./personal.controller.js";
import { PersonalService } from "./personal.service.js";

@Module({
  imports: [AuthenticationModule, TypeOrmModule.forFeature([EmployeeEntity, RoleEntity])],
  controllers: [PersonalController],
  providers: [PersonalService],
})
export class PersonalModule {}
