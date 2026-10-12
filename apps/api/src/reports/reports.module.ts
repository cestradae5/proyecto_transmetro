import { Module } from "@nestjs/common";

import { AuthenticationModule } from "../authentication/authentication.module.js";
import { PdfRenderer } from "./pdf/pdf-renderer.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";

@Module({
  imports: [AuthenticationModule],
  controllers: [ReportsController],
  providers: [ReportsService, { provide: PdfRenderer, useFactory: () => new PdfRenderer() }],
})
export class ReportsModule {}
