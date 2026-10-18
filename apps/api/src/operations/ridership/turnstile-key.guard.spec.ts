import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import { TurnstileKeyGuard } from "./turnstile-key.guard.js";

const contextWith = (headers: Record<string, string>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  }) as unknown as ExecutionContext;

describe("TurnstileKeyGuard (S6)", () => {
  const guard = new TurnstileKeyGuard();
  const saved = { ...process.env };

  afterEach(() => {
    process.env.TURNSTILE_SIMULATOR_ENABLED = saved.TURNSTILE_SIMULATOR_ENABLED;
    process.env.TURNSTILE_API_KEY = saved.TURNSTILE_API_KEY;
  });

  const configure = (enabled: string | undefined, key: string | undefined) => {
    if (enabled === undefined) delete process.env.TURNSTILE_SIMULATOR_ENABLED;
    else process.env.TURNSTILE_SIMULATOR_ENABLED = enabled;
    if (key === undefined) delete process.env.TURNSTILE_API_KEY;
    else process.env.TURNSTILE_API_KEY = key;
  };

  it("allows a request with the configured key while enabled", () => {
    configure("true", "secret-key");

    expect(guard.canActivate(contextWith({ "x-turnstile-key": "secret-key" }))).toBe(true);
  });

  it.each([undefined, "false", "TRUE", "1"])("hides the endpoint with 404 when the flag is %p", (enabled) => {
    configure(enabled, "secret-key");

    expect(() => guard.canActivate(contextWith({ "x-turnstile-key": "secret-key" }))).toThrow(NotFoundException);
  });

  it.each([
    ["no header", {}],
    ["a wrong key", { "x-turnstile-key": "other" }],
    ["a prefix of the key", { "x-turnstile-key": "secret" }],
  ])("rejects %s with 401", (_label, headers) => {
    configure("true", "secret-key");

    expect(() => guard.canActivate(contextWith(headers))).toThrow(UnauthorizedException);
  });

  it.each([undefined, ""])("fails closed with 401 when the configured key is %p", (key) => {
    configure("true", key);

    expect(() => guard.canActivate(contextWith({ "x-turnstile-key": "" }))).toThrow(UnauthorizedException);
  });
});
