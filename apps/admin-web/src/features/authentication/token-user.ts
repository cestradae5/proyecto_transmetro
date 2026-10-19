import type { User } from "./auth-context";

// Decodes the (already server-signed) JWT payload into the session user.
// JWT segments are base64url and the payload is UTF-8 JSON, so plain atob()
// would break on "-"/"_" and garble accented role names.
export function userFromToken(token: string): User {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("Invalid JWT format");
  }

  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const payload = JSON.parse(new TextDecoder().decode(bytes));

  return {
    email: payload.email,
    employeeId: payload.employeeId,
    roles: payload.roles,
    permissions: payload.permissions,
    scope: payload.scope ?? { role: "PUBLIC", modules: [] },
    ...(payload.demoActor ? { demoActor: payload.demoActor } : {}),
  };
}
