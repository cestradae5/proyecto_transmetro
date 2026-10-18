import { timingSafeEqual } from "node:crypto";

import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";

import { TURNSTILE_KEY_HEADER } from "./ridership.constants.js";

// S6: the turnstile is a device, not a logged-in user. The endpoint exists
// only while TURNSTILE_SIMULATOR_ENABLED is exactly "true" (404 otherwise)
// and needs X-Turnstile-Key equal to TURNSTILE_API_KEY. An unset or empty
// key rejects every request. Read on each request so a deploy can switch it
// off without a code change.
@Injectable()
export class TurnstileKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.TURNSTILE_SIMULATOR_ENABLED !== "true") {
      throw new NotFoundException();
    }

    const expected = process.env.TURNSTILE_API_KEY ?? "";
    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const received = request.headers[TURNSTILE_KEY_HEADER];
    if (!expected || typeof received !== "string" || !sameKey(received, expected)) {
      throw new UnauthorizedException("Clave de talanquera inválida.");
    }
    return true;
  }
}

function sameKey(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
