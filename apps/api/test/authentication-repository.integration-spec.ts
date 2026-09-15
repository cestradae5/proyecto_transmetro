import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import { DataSource } from "typeorm";

import {
  EmployeeEntity,
  EMPLOYEE_STATUSES,
  type EmployeeStatus,
} from "../src/authentication/entities/employee.entity.js";
import { PermissionEntity } from "../src/authentication/entities/permission.entity.js";
import { RoleEntity } from "../src/authentication/entities/role.entity.js";
import { SessionEntity } from "../src/authentication/entities/session.entity.js";
import { AuditLogEntity } from "../src/authentication/entities/audit-log.entity.js";
import { EmployeeRepository } from "../src/authentication/infrastructure/employee.repository.js";
import { readIntegrationDatabaseEnvironment } from "../src/platform/configuration/environment.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));

config({
  path: resolve(currentDirectory, "..", "..", "..", ".env"),
  quiet: true,
});

describe("EmployeeRepository PostgreSQL integration", () => {
  let dataSource: DataSource | undefined;
  let employeeId: string | undefined;
  let roleId: string | undefined;

  beforeAll(async () => {
    const database = readIntegrationDatabaseEnvironment();

    dataSource = new DataSource({
      database: database.database,
      entities: [
        EmployeeEntity,
        RoleEntity,
        PermissionEntity,
        SessionEntity,
        AuditLogEntity,
      ],
      host: database.host,
      logging: false,
      password: database.password,
      port: database.port,
      ssl: database.ssl,
      synchronize: false,
      type: "postgres",
      username: database.username,
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    if (dataSource === undefined) {
      return;
    }

    if (employeeId !== undefined) {
      await dataSource.getRepository(EmployeeEntity).delete(employeeId);
      employeeId = undefined;
    }

    if (roleId !== undefined) {
      await dataSource.getRepository(RoleEntity).delete(roleId);
      roleId = undefined;
    }
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function seedEmployee(status: EmployeeStatus): Promise<{
    email: string;
    employee: EmployeeEntity;
    role: RoleEntity;
  }> {
    const suffix = randomUUID().replaceAll("-", "");
    const email = `lock-query-${suffix}@example.test`;
    const role = await dataSource!.getRepository(RoleEntity).save({
      active: true,
      code: `test-${suffix}`,
      description: "Repository integration role",
      name: `Repository test ${suffix}`,
    });
    roleId = role.id;
    const employee = await dataSource!.getRepository(EmployeeEntity).save({
      email,
      name: "Repository Integration Employee",
      role,
      status,
    });
    employeeId = employee.id;

    return { email, employee, role };
  }

  it("executes the eligibility query in a real PostgreSQL transaction", async () => {
    const { email, employee, role } = await seedEmployee(EMPLOYEE_STATUSES.ACTIVE);

    await expect(
      dataSource!.transaction((manager) =>
        new EmployeeRepository().findEligibleByEmail(manager, email.toUpperCase()),
      ),
    ).resolves.toMatchObject({
      email,
      id: employee.id,
      role: { id: role.id },
    });
  });

  it("does not return an inactive employee from the real PostgreSQL query", async () => {
    const { email } = await seedEmployee(EMPLOYEE_STATUSES.INACTIVE);

    await expect(
      dataSource!.transaction((manager) =>
        new EmployeeRepository().findEligibleByEmail(manager, email),
      ),
    ).resolves.toBeNull();
  });
});
