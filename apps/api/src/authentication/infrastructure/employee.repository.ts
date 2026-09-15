import type { EntityManager } from "typeorm";

import {
  EMPLOYEE_STATUSES,
  EmployeeEntity,
} from "../entities/employee.entity.js";

export class EmployeeRepository {
  async findEligibleByEmail(
    manager: EntityManager,
    email: string,
  ): Promise<EmployeeEntity | null> {
    return manager
      .getRepository(EmployeeEntity)
      .createQueryBuilder("employee")
      .setLock("pessimistic_write", undefined, ["employee"])
      .innerJoinAndSelect("employee.role", "role")
      .leftJoinAndSelect("role.permissions", "permission")
      .where("LOWER(employee.email) = :email", {
        email: email.trim().toLowerCase(),
      })
      .andWhere("employee.status = :employeeStatus", {
        employeeStatus: EMPLOYEE_STATUSES.ACTIVE,
      })
      .andWhere("role.active = :roleActive", { roleActive: true })
      .getOne();
  }
}
