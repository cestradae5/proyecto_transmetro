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

// Mirrors the keys of MODULE_LABELS in
// apps/admin-web/src/features/authentication/landing-page.tsx.
// A module outside this set renders nothing, so the backend must never emit one.
const FRONTEND_MODULES = [
  "fleet",
  "gis",
  "audit",
  "report",
  "recharge",
  "self_profile",
] as const;

// Permission grants seeded in database/init.sql (tbl_rol_permiso).
const ADMIN_PERMISSIONS = [
  "PERFIL_PROPIO_CONSULTAR",
  "EMPLEADOS_PERFILES_ADMINISTRAR",
  "ROLES_PERMISOS_ADMINISTRAR",
  "INFRAESTRUCTURA_GESTIONAR",
  "FLOTA_GESTIONAR",
  "FLOTA_ESTACION_SOLICITAR",
  "UNIDAD_ASIGNADA_CONSULTAR",
  "METRICAS_UNIDAD_REPORTAR",
  "ALERTAS_ESTACION_GESTIONAR",
  "ALERTAS_UNIDAD_GESTIONAR",
  "ALERTAS_OPERATIVAS_GESTIONAR",
  "PANEL_OPERATIVO_CENTRAL_USAR",
  "REPORTES_ADMINISTRATIVOS_CONSULTAR",
  "AUDITORIA_BITACORA_CONSULTAR",
  "RECARGAS_REPORTES_CONSULTAR",
];

const PILOTO_PERMISSIONS = [
  "PERFIL_PROPIO_CONSULTAR",
  "UNIDAD_ASIGNADA_CONSULTAR",
  "METRICAS_UNIDAD_REPORTAR",
  "ALERTAS_UNIDAD_GESTIONAR",
];

const GUARDIA_PERMISSIONS = ["PERFIL_PROPIO_CONSULTAR"];

const OPERADOR_ESTACION_PERMISSIONS = [
  "PERFIL_PROPIO_CONSULTAR",
  "FLOTA_ESTACION_SOLICITAR",
  "ALERTAS_ESTACION_GESTIONAR",
];

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

  it("derives modules per role from seeded permissions", () => {
    expect(deriveModulesFromPermissions(PILOTO_PERMISSIONS)).toEqual([
      "fleet",
      "report",
      "self_profile",
    ]);
    expect(deriveModulesFromPermissions(GUARDIA_PERMISSIONS)).toEqual([
      "self_profile",
    ]);
    // ALERTAS_ESTACION_GESTIONAR → report
    expect(deriveModulesFromPermissions(OPERADOR_ESTACION_PERMISSIONS)).toEqual([
      "fleet",
      "report",
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
    ).toEqual(["audit"]);
  });
});
