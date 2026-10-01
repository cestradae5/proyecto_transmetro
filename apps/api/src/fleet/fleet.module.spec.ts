// Structural coverage for the FleetModule skeleton (design.md Approach /
// task 1.2.7). This slice ships no fleet controllers/entities yet (those
// arrive in Slices 2-4), so the module only wires AuthenticationModule
// (AuditRepository DI) and InfrastructureModule (LineaService/ParqueoService
// DI for Slice 2's derived parqueo composition), plus the pilot eligibility
// lookup provider fleet services will need starting Slice 4.

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { InfrastructureModule } from "../infrastructure/infrastructure.module.js";
import { FleetModule } from "./fleet.module.js";
import { PilotEligibilityLookup } from "./shared/pilot-eligibility.lookup.js";

describe("FleetModule (skeleton)", () => {
  it("imports AuthenticationModule and InfrastructureModule", () => {
    const imports = Reflect.getMetadata("imports", FleetModule) as unknown[];
    expect(imports).toContain(AuthenticationModule);
    expect(imports).toContain(InfrastructureModule);
  });

  it("provides PilotEligibilityLookup for later fleet services to consume", () => {
    const providers = Reflect.getMetadata("providers", FleetModule) as unknown[];
    expect(providers).toContain(PilotEligibilityLookup);
  });
});
