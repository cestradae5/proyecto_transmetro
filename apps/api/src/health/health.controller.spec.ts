import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("reports an operational service", () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({ status: "ok" });
  });
});
