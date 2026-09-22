// Task 2.4 — RBAC module derivation.
// The dashboard renders a card per module in `scope.modules`. Modules must be
// derived from the permissions the DB grants the role, NOT from the role name.
//
// Regression guard for three defects:
//   1. `ROLE_MODULES[roleName]` missed every real role (DB seeds
//      'Administrador del sistema', the map keyed ADMIN/DRIVER/OPERATOR).
//   2. Backend emitted module names the frontend does not know ("reports",
//      "dashboard", "passengers"...), so cards were silently dropped.
//   3. Result: an admin with all 15 permissions saw 0 cards.

import {
  PERMISSION_TO_MODULE,
  deriveModulesFromPermissions,
} from "./authentication.service.js";
import { ROLE_PERMISSIONS } from "./role-permissions.fixtures.js";

// Mirrors the keys of MODULE_LABELS in
// apps/admin-web/src/features/authentication/landing-page.tsx.
// A module outside this set renders nothing, so the backend must never emit one.
const FRONTEND_MODULES = [
  "infrastructure",
  "fleet",
  "personnel",
  "operational_alerts",
  "central_operations_panel",
  "administrative_reports",
  "audit_log",
  "recharge_reporting",
  "self_profile",
] as const;

const ADMIN_PERMISSIONS = ROLE_PERMISSIONS.ADMINISTRADOR_SISTEMA!;
const OPERADOR_CENTRAL_PERMISSIONS = ROLE_PERMISSIONS.OPERADOR_CENTRAL!;
const PILOTO_PERMISSIONS = ROLE_PERMISSIONS.PILOTO!;
const GUARDIA_PERMISSIONS = ROLE_PERMISSIONS.GUARDIA!;
const OPERADOR_ESTACION_PERMISSIONS = ROLE_PERMISSIONS.OPERADOR_ESTACION!;

describe("RBAC module derivation (task 2.4)", () => {
  it("never emits a module the frontend cannot render", () => {
    for (const [permission, module] of Object.entries(PERMISSION_TO_MODULE)) {
      expect(FRONTEND_MODULES).toContain(module);
      expect(permission).toMatch(/^[A-Z_]+$/);
    }
  });

  it("grants an administrator every dashboard card", () => {
    // The original defect: this returned [] because the role is named
    // 'Administrador del sistema', not 'ADMIN'.
    expect(deriveModulesFromPermissions(ADMIN_PERMISSIONS)).toEqual([
      ...FRONTEND_MODULES,
    ]);
  });

  it("grants a central operator every dashboard card (approved matrix)", () => {
    expect(deriveModulesFromPermissions(OPERADOR_CENTRAL_PERMISSIONS)).toEqual([
      ...FRONTEND_MODULES,
    ]);
  });

  it("derives modules per role from seeded permissions", () => {
    expect(deriveModulesFromPermissions(PILOTO_PERMISSIONS)).toEqual([
      "fleet",
      "operational_alerts",
      "self_profile",
    ]);
    expect(deriveModulesFromPermissions(GUARDIA_PERMISSIONS)).toEqual([
      "self_profile",
    ]);
    // ALERTAS_ESTACION_GESTIONAR → operational_alerts
    expect(deriveModulesFromPermissions(OPERADOR_ESTACION_PERMISSIONS)).toEqual([
      "fleet",
      "operational_alerts",
      "self_profile",
    ]);
  });

  it("deduplicates modules reached by several permissions", () => {
    // FLOTA_GESTIONAR, FLOTA_ESTACION_SOLICITAR and UNIDAD_ASIGNADA_CONSULTAR
    // all lead to "fleet".
    expect(
      deriveModulesFromPermissions([
        "FLOTA_GESTIONAR",
        "FLOTA_ESTACION_SOLICITAR",
        "UNIDAD_ASIGNADA_CONSULTAR",
      ]),
    ).toEqual(["fleet"]);
  });

  it("emits modules in a stable order regardless of permission order", () => {
    const forward = deriveModulesFromPermissions(ADMIN_PERMISSIONS);
    const reversed = deriveModulesFromPermissions([...ADMIN_PERMISSIONS].reverse());
    expect(reversed).toEqual(forward);
  });

  it("ignores unknown permissions and grants nothing without permissions", () => {
    expect(deriveModulesFromPermissions([])).toEqual([]);
    expect(deriveModulesFromPermissions(["PERMISO_INEXISTENTE"])).toEqual([]);
    expect(
      deriveModulesFromPermissions(["PERMISO_INEXISTENTE", "AUDITORIA_BITACORA_CONSULTAR"]),
    ).toEqual(["audit_log"]);
  });

  it("leaves ROLES_PERMISOS_ADMINISTRAR unmapped (admin-only, not a dashboard card)", () => {
    expect(deriveModulesFromPermissions(["ROLES_PERMISOS_ADMINISTRAR"])).toEqual([]);
  });
});
