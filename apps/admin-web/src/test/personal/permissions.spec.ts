import { describe, it, expect } from "vitest";
import {
  EMPLEADOS_PERFILES_ADMINISTRAR,
  canManageEmpleados,
} from "../../features/personal/permissions";

describe("canManageEmpleados", () => {
  it("exposes the permission code", () => {
    expect(EMPLEADOS_PERFILES_ADMINISTRAR).toBe("EMPLEADOS_PERFILES_ADMINISTRAR");
  });

  it("returns true when the user has the permission", () => {
    expect(
      canManageEmpleados({ permissions: ["OTHER", "EMPLEADOS_PERFILES_ADMINISTRAR"] }),
    ).toBe(true);
  });

  it("returns false when the permission is missing", () => {
    expect(canManageEmpleados({ permissions: ["FLOTA_GESTIONAR"] })).toBe(false);
  });

  it("returns false for null, undefined or malformed permissions", () => {
    expect(canManageEmpleados(null)).toBe(false);
    expect(canManageEmpleados(undefined)).toBe(false);
    expect(
      canManageEmpleados({ permissions: undefined as unknown as string[] }),
    ).toBe(false);
  });
});
