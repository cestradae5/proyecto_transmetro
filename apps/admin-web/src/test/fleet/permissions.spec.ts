import { describe, it, expect } from "vitest";
import { FLEET_MANAGE_PERMISSION, FLEET_STATION_VIEW_PERMISSION, hasPermission } from "../../features/fleet/permissions";

describe("hasPermission", () => {
  it("returns true when the user has the permission", () => {
    expect(hasPermission({ permissions: ["FLOTA_GESTIONAR", "OTHER"] }, FLEET_MANAGE_PERMISSION)).toBe(true);
  });

  it("exposes the station view permission code", () => {
    expect(FLEET_STATION_VIEW_PERMISSION).toBe("FLOTA_ESTACION_CONSULTAR");
    expect(hasPermission({ permissions: ["FLOTA_ESTACION_CONSULTAR"] }, FLEET_STATION_VIEW_PERMISSION)).toBe(true);
  });

  it("returns false when the permission is missing", () => {
    expect(hasPermission({ permissions: ["OTHER"] }, "FLOTA_GESTIONAR")).toBe(false);
  });

  it("returns false for a null or undefined user", () => {
    expect(hasPermission(null, "FLOTA_GESTIONAR")).toBe(false);
    expect(hasPermission(undefined, "FLOTA_GESTIONAR")).toBe(false);
  });

  it("returns false when permissions is not an array", () => {
    expect(hasPermission({ permissions: undefined as unknown as string[] }, "FLOTA_GESTIONAR")).toBe(false);
  });
});
