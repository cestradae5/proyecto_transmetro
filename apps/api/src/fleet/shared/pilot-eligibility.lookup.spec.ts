// Unit coverage for PilotEligibilityLookup (design.md Decision 1): a thin,
// stateless read of an employee's role code by id, following the exact same
// manager-scoped pattern as AuthenticationModule's EmployeeRepository —
// no constructor-injected repository, so it works inside any transaction.

import { jest } from "@jest/globals";
import type { EntityManager } from "typeorm";

import { PilotEligibilityLookup } from "./pilot-eligibility.lookup.js";

function makeManager(getOneResult: unknown) {
  const queryBuilder = {
    getOne: jest.fn(async () => getOneResult),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  };
  const manager = {
    getRepository: jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    }),
  } as unknown as EntityManager;
  return { manager, queryBuilder };
}

describe("PilotEligibilityLookup", () => {
  it("returns the employee id and role code when the employee exists", async () => {
    const { manager, queryBuilder } = makeManager({
      id: "7",
      role: { code: "PILOTO" },
    });

    await expect(
      new PilotEligibilityLookup().findRoleCode(manager, "7"),
    ).resolves.toEqual({ id: "7", roleCode: "PILOTO" });
    expect(queryBuilder.where).toHaveBeenCalledWith("employee.id = :employeeId", {
      employeeId: "7",
    });
  });

  it("returns null when no employee matches the given id", async () => {
    const { manager } = makeManager(null);

    await expect(
      new PilotEligibilityLookup().findRoleCode(manager, "999"),
    ).resolves.toBeNull();
  });
});
