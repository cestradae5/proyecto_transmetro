import { Injectable, NotFoundException, type CanActivate } from "@nestjs/common";

// S5: while recharges are simulated (no real payment) they hand out free
// balance, so the route exists only when RECHARGE_SIMULATOR_ENABLED is
// exactly "true". Read on each request so a deploy can switch it off.
@Injectable()
export class RechargeSimulatorGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.RECHARGE_SIMULATOR_ENABLED !== "true") {
      throw new NotFoundException();
    }
    return true;
  }
}
