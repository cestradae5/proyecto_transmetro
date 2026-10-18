import { Module } from "@nestjs/common";

import { CitizenController } from "./citizen.controller.js";
import { CitizenService } from "./citizen.service.js";
import { QpayproPaymentsController } from "./qpaypro/qpaypro-payments.controller.js";
import { QpayproPaymentsService } from "./qpaypro/qpaypro-payments.service.js";
import { HttpQpayproClient, QPAYPRO_CLIENT } from "./qpaypro/qpaypro.client.js";
import { RechargeSimulatorGuard } from "./recharge-simulator.guard.js";

// Public citizen endpoints (apps/user-web). No forFeature: the services use
// the shared DataSource. QpayproPaymentsService is exported for the staff
// verify route of CardsModule (qpaypro-checkout S7).
@Module({
  controllers: [CitizenController, QpayproPaymentsController],
  providers: [
    CitizenService,
    QpayproPaymentsService,
    RechargeSimulatorGuard,
    { provide: QPAYPRO_CLIENT, useFactory: () => new HttpQpayproClient() },
  ],
  exports: [QpayproPaymentsService],
})
export class CitizenModule {}
