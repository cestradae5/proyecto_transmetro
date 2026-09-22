// Task 2.1–2.3, 6.1, 6.2 — `verifyToken()` recomputes `scope.modules`.
// Decision 2 (design.md): every `/authentication/me` call recomputes
// `scope.modules` from the stable `permissions` array baked into the JWT,
// instead of trusting the `scope.modules` array baked at login(). This lets
// a PERMISSION_TO_MODULE rename apply immediately to already-issued 12h
// tokens, without forcing re-login.

import jwt from "jsonwebtoken";

import { AuthenticationService } from "./authentication.service.js";
import { InvalidCredentials } from "./authentication.contracts.js";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-change-in-production";

function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

// verifyToken() only decodes and re-derives from the JWT payload — it needs
// no repository, DataSource, or Google verifier, so those deps are stubbed.
function makeService(): AuthenticationService {
  return new AuthenticationService({} as never, {} as never, {} as never, {} as never);
}

describe("AuthenticationService.verifyToken (task 2.1–2.3, 6.1, 6.2)", () => {
  it("recomputes scope.modules from permissions, ignoring the stale baked value", async () => {
    // Simulates a 12h token issued BEFORE the module-key rename: permissions
    // stayed the same, but the baked scope.modules used the old "gis" key.
    const service = makeService();
    const token = signToken({
      employeeId: "emp-1",
      email: "OPERADOR@TRANSMETRO.GT",
      roles: ["OPERADOR_CENTRAL"],
      permissions: ["INFRAESTRUCTURA_GESTIONAR", "PERFIL_PROPIO_CONSULTAR"],
      scope: { role: "OPERADOR_CENTRAL", modules: ["gis"] }, // stale baked value
    });

    const result = await service.verifyToken(token);

    expect(result.scope.modules).toEqual(["infrastructure", "self_profile"]);
  });

  it("preserves the stable permissions array unchanged", async () => {
    const service = makeService();
    const permissions = ["FLOTA_GESTIONAR", "PERFIL_PROPIO_CONSULTAR"];
    const token = signToken({
      employeeId: "emp-2",
      email: "PILOTO@TRANSMETRO.GT",
      roles: ["PILOTO"],
      permissions,
      scope: { role: "PILOTO", modules: [] },
    });

    const result = await service.verifyToken(token);

    expect(result.permissions).toEqual(permissions);
    expect(result.roles).toEqual(["PILOTO"]);
    expect(result.employeeId).toBe("emp-2");
  });

  it("keeps scope.role from the token and only recomputes scope.modules", async () => {
    const service = makeService();
    const token = signToken({
      employeeId: "emp-3",
      email: "GUARDIA@TRANSMETRO.GT",
      roles: ["GUARDIA"],
      permissions: ["PERFIL_PROPIO_CONSULTAR"],
      scope: { role: "GUARDIA", modules: ["unrelated"] },
    });

    const result = await service.verifyToken(token);

    expect(result.scope).toEqual({ role: "GUARDIA", modules: ["self_profile"] });
  });

  it("rejects an invalid or expired token", async () => {
    const service = makeService();

    await expect(service.verifyToken("not-a-real-token")).rejects.toThrow(InvalidCredentials);
  });
});
