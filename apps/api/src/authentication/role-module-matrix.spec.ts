// Task 4.1 — Role × Module coverage matrix (spec Requirement 6).
// Validates all 5 seeded roles against all 8 canonical dashboard modules,
// confirming both granted and denied access per the approved matrix
// (Engram #1817). `self_profile` is excluded: it is an ambient card every
// authenticated employee gets, not a role-differentiated module (Decision 3).

import { deriveModulesFromPermissions } from "./authentication.service.js";
import { ROLE_PERMISSIONS } from "./role-permissions.fixtures.js";

type Cell = readonly [role: string, module: string, expected: boolean];

// Every (role, module) combination, per the approved matrix (Engram #1817).
// ADMINISTRADOR_SISTEMA and OPERADOR_CENTRAL both reach all 8 modules;
// OPERADOR_ESTACION and PILOTO reach only fleet + operational_alerts;
// GUARDIA reaches none (self_profile only, outside this matrix).
const MODULES = [
  "infrastructure",
  "fleet",
  "personnel",
  "operational_alerts",
  "central_operations_panel",
  "reports",
  "recharge_reporting",
] as const;

const GRANTED_BY_ROLE: Record<string, readonly string[]> = {
  ADMINISTRADOR_SISTEMA: MODULES,
  OPERADOR_CENTRAL: MODULES,
  OPERADOR_ESTACION: ["fleet", "operational_alerts"],
  PILOTO: ["fleet", "operational_alerts"],
  GUARDIA: [],
};

const CELLS: Cell[] = Object.entries(GRANTED_BY_ROLE).flatMap(([role, granted]) =>
  MODULES.map((module) => [role, module, granted.includes(module)] as const),
);

describe("Role × Module coverage matrix (task 4.1, spec Requirement 6)", () => {
  for (const [role, module, expected] of CELLS) {
    it(`${role} ${expected ? "grants" : "denies"} ${module}`, () => {
      const grantedModules = deriveModulesFromPermissions(ROLE_PERMISSIONS[role]!);
      expect(grantedModules.includes(module)).toBe(expected);
    });
  }

  it("denies every module for an unknown/unrecognized role", () => {
    // An unrecognized role carries no permissions at all.
    const grantedModules = deriveModulesFromPermissions([]);

    for (const module of MODULES) {
      expect(grantedModules.includes(module)).toBe(false);
    }
  });
});
